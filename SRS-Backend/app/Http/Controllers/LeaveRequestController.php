<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestAmendment;
use App\Models\Notification;
use App\Models\User;
use App\Services\LeaveDeductionService;
use App\Services\LeaveYearService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class LeaveRequestController extends Controller
{
    public function __construct(
        private LeaveDeductionService $deductions,
        private LeaveYearService $leaveYears
    )
    {
    }

    public function index(Request $request): JsonResponse
    {
        // The page requests active and history in parallel. Process due balances
        // at most once per minute instead of scanning the same rows twice.
        if (Cache::add('leave-deductions-processed', true, now()->addMinute())) {
            $this->deductions->processDue();
            $this->leaveYears->refreshDue();
        }

        $user = auth()->user();
        $relations = [
            // List pages only need identity/approval metadata. Signature images
            // are loaded by show() when a request is opened or printed.
            'approver:id,name,role',
            'rejecter:id,name,role',
            'managerApprover:id,name,role',
            'hrApprover:id,name,role',
            'cancellationRequester:id,name',
            'cancellationRejecter:id,name',
            'user:id,name,profile_photo_path',
            'employee:id,name,direct_manager_id,user_id,user_manager_id',
            'employee.directManager:id,name,position,user_id',
            'employee.userManager:id,name',
        ];
        if (Schema::hasTable('leave_request_amendments')) {
            $relations[] = 'pendingAmendment.requester:id,name';
        }
        $query = LeaveRequest::with($relations);

        if (
            in_array($user->role, ['admin', 'depot_manager', 'hr'], true)
            || $user->hasPermission('leaves.approve_hr')
        ) {
            // Full visibility.
        } else {
            $myEmp = Employee::active()->where('user_id', $user->id)->first();
            $managedEmployees = Employee::active()
                ->where(function ($employees) use ($user, $myEmp) {
                    $employees->where('user_manager_id', $user->id);
                    if ($myEmp) {
                        $employees->orWhere('direct_manager_id', $myEmp->id);
                    }
                })
                ->get(['id', 'name']);
            $empIds = $managedEmployees->pluck('id');
            $empNames = $managedEmployees->pluck('name');
            $query->where(function ($q) use ($user, $empIds, $empNames) {
                $q->where('user_id', $user->id)
                    ->orWhereIn('employee_id', $empIds)
                    ->orWhere(function ($legacy) use ($empNames) {
                        $legacy->whereNull('employee_id')->whereIn('employee_name', $empNames);
                    });
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // Scope: 'active' = pending/manager_approved/approved (still relevant)
        //        'history' = approved-deducted/rejected/cancelled/rescheduled (closed)
        if ($request->filled('scope')) {
            if ($request->scope === 'active') {
                $query->where(function ($q) {
                    $q->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'cancellation_pending', 'amendment_pending'])
                      ->orWhere(function ($qq) {
                          $qq->where('type', 'lrf')
                            ->where('status', 'approved')
                            ->whereNull('balance_deducted_at');
                      });
                });
            } elseif ($request->scope === 'history') {
                $query->where(function ($q) {
                    $q->whereIn('status', ['rejected', 'cancelled', 'rescheduled'])
                      ->orWhere(function ($qq) {
                          $qq->where('type', 'lrf')
                             ->where('status', 'approved')
                             ->whereNotNull('balance_deducted_at');
                      })
                      ->orWhere(function ($qq) {
                          $qq->where('type', 'otr')
                             ->where('status', 'approved');
                      });
                });
            }
        }

        // Date range filter (filters by created_at — when request was submitted)
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        $query->orderByDesc('created_at');

        // Pagination — only when explicitly requested (so existing callers stay backward compatible)
        if ($request->filled('per_page')) {
            $perPage = min(200, max(1, (int) $request->per_page));
            $page = max(1, (int) $request->input('page', 1));
            $paginated = $query->paginate($perPage, ['*'], 'page', $page);
            $items = collect($paginated->items());
            $this->attachArchiveStatus($items, $user);
            $this->attachWorkflowAccess($items, $user);
            $this->hideConfidentialBalances($items, $user);
            return response()->json([
                'success'    => true,
                'data'       => $items,
                'pagination' => [
                    'current_page' => $paginated->currentPage(),
                    'last_page'    => $paginated->lastPage(),
                    'per_page'     => $paginated->perPage(),
                    'total'        => $paginated->total(),
                ],
            ]);
        }

        $items = $query->get();
        $this->attachArchiveStatus($items, $user);
        $this->attachWorkflowAccess($items, $user);
        $this->hideConfidentialBalances($items, $user);
        return response()->json(['success' => true, 'data' => $items]);
    }

    public function archive(LeaveRequest $leaveRequest): JsonResponse
    {
        $this->ensureHrArchiveAccess(auth()->user());
        abort_unless(
            in_array($leaveRequest->type, ['lrf', 'otr'], true) && $leaveRequest->status === 'approved',
            422,
            'Only fully approved leave or overtime requests can be marked as printed.'
        );

        DB::table('leave_request_archives')->updateOrInsert(
            [
                'leave_request_id' => $leaveRequest->id,
                'user_id' => auth()->id(),
            ],
            [
                'archived_at' => now(),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        return response()->json(['success' => true]);
    }

    public function unarchive(LeaveRequest $leaveRequest): JsonResponse
    {
        $this->ensureHrArchiveAccess(auth()->user());

        DB::table('leave_request_archives')
            ->where('leave_request_id', $leaveRequest->id)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'type' => 'required|in:lrf,otr',
            'employee_name' => 'required|string|max:255',
            'job_title' => 'nullable|string|max:255',
            'department' => 'nullable|string|max:100',
            'department_label' => 'nullable|string|max:100',
            'direct_manager_name' => 'nullable|string|max:255',
            'alternate_employee_id' => 'nullable|exists:employees,id',
            'alternate_employee_name' => 'nullable|string|max:255',
            'employee_id' => 'nullable|exists:employees,id',
            'leave_type' => 'required_if:type,lrf|nullable|in:annual,casual,sick,early',
            'paid' => 'nullable|boolean',
            'company_paid' => 'nullable|boolean',
            'company_paid_purpose' => 'nullable|in:business_trip,company_premises,marriage,exam,paternity,other',
            'available_balance' => 'nullable|numeric|min:0',
            'request_date' => 'nullable|date',
            'start_date' => 'required_if:type,lrf|nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'days' => 'nullable|numeric|min:0',
            'purpose' => 'nullable|string|max:1000',
            'early_from' => 'nullable|date_format:H:i',
            'early_to' => 'nullable|date_format:H:i',
            'ot_date' => 'required_if:type,otr|nullable|date',
            'start_time' => 'required_if:type,otr|nullable|date_format:H:i',
            'end_time' => 'required_if:type,otr|nullable|date_format:H:i',
            'hours' => 'nullable|numeric|min:0',
            'explanation' => 'required_if:type,otr|nullable|string|max:2000',
            'overtime_results' => 'nullable|string|max:2000',
            'medical_attachment' => 'required_if:leave_type,sick|nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        if ($request->type === 'lrf' && $request->employee_id && $request->leave_type !== 'early') {
            $start = $request->start_date;
            $end = $request->end_date ?? $request->start_date;
            $conflict = LeaveRequest::where('employee_id', $request->employee_id)
                ->where('type', 'lrf')
                ->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'approved', 'cancellation_pending', 'amendment_pending'])
                ->where(function ($q) use ($start, $end) {
                    $q->whereBetween('start_date', [$start, $end])
                        ->orWhereBetween('end_date', [$start, $end])
                        ->orWhere(fn ($q2) => $q2->where('start_date', '<=', $start)->where('end_date', '>=', $end));
                })
                ->exists();

            if ($conflict) {
                return response()->json([
                    'success' => false,
                    'message' => 'The employee already has a leave request covering this date range. Please cancel it first.',
                ], 422);
            }
        }

        $data = $v->validated();
        $data['company_paid'] = (bool) ($data['company_paid'] ?? false);
        if ($data['company_paid']) {
            $this->validateCompanyPaidPurpose($data);
            // The official Word form has only Paid/Unpaid. Company-paid is
            // represented as Paid there, while this flag protects the balance.
            $data['paid'] = true;
        } else {
            $data['company_paid_purpose'] = null;
        }
        unset($data['medical_attachment']);
        if ($data['type'] === 'lrf' && ($data['leave_type'] ?? null) === 'early') {
            $earlyDays = $this->earlyLeaveDays($data['early_from'] ?? null, $data['early_to'] ?? null);
            if ($earlyDays === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Early Leave must be between 1 minute and 6 hours, and To time must be after From time.',
                ], 422);
            }
            $data['days'] = $earlyDays;
        }
        if ($data['type'] === 'otr') {
            $hours = $this->overtimeHours(
                $data['ot_date'] ?? null,
                $data['start_time'] ?? null,
                $data['end_time'] ?? null
            );
            if ($hours === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Overtime end time must be after start time and within 24 hours.',
                ], 422);
            }
            $data['hours'] = $hours;
        }
        $data['user_id'] = auth()->id();
        $data['status'] = 'pending';
        $employee = !empty($data['employee_id']) ? Employee::active()->find($data['employee_id']) : null;
        if (!$employee && !empty($data['employee_name'])) {
            $matchingEmployees = Employee::active()
                ->whereRaw('LOWER(TRIM(name)) = ?', [strtolower(trim($data['employee_name']))])
                ->limit(2)
                ->get();
            if ($matchingEmployees->count() === 1) {
                $employee = $matchingEmployees->first();
                $data['employee_id'] = $employee->id;
            }
        }
        if (!$employee) {
            return response()->json([
                'success' => false,
                'message' => 'Select the employee from the search results so the request reaches the correct direct manager and HR.',
            ], 422);
        }
        if ($employee) {
            $this->leaveYears->refreshDue($employee->id);
        }
        if ($data['type'] === 'lrf' && ($data['leave_type'] ?? null) !== 'early') {
            $data['days'] = $this->workingLeaveDays(
                $employee,
                $data['start_date'],
                $data['end_date'] ?? $data['start_date']
            );
        }
        if ($employee && !$this->directManagerUserId($employee)) {
            // There is nobody who can perform the manager step. Move the
            // request directly to HR without inventing an approver/signature.
            $data['status'] = 'manager_approved';
        }
        if (
            $data['type'] === 'lrf'
            && $employee
            && ($data['paid'] ?? true)
            && !$data['company_paid']
            && in_array($data['leave_type'] ?? null, ['annual', 'casual', 'sick', 'early'], true)
            && (float) ($data['days'] ?? 0) > 0
            && !$this->hasAvailableLeaveBalance($employee->id, $data['leave_type'], (float) $data['days'])
        ) {
            return response()->json([
                'success' => false,
                'code' => 'INSUFFICIENT_LEAVE_BALANCE',
                'message' => 'The employee does not have enough available leave balance for this request.',
            ], 422);
        }
        if (
            $data['type'] === 'lrf'
            && $employee
            && ($data['paid'] ?? true)
            && !$data['company_paid']
            && in_array($data['leave_type'] ?? null, ['annual', 'casual', 'sick', 'early'], true)
        ) {
            $available = $this->availableLeaveBalances($employee->id);
            // The official LRF always records the employee's total leave
            // balance. Sick entitlement remains tracked separately.
            $data['available_balance'] = $available['annual'];
            if (Schema::hasColumn('leave_requests', 'casual_available_balance')) {
                $data['casual_available_balance'] = $available['casual'];
            }
        } else {
            // Overtime requests do not use leave balance. Keep zero for
            // compatibility with older databases where the column is NOT NULL.
            $data['available_balance'] = 0;
        }
        if (empty($data['direct_manager_name']) && $employee?->direct_manager_id) {
            $manager = Employee::active()->with('user:id,role')->find($employee->direct_manager_id);
            if ($manager?->user?->role !== 'depot_manager') {
                $data['direct_manager_name'] = $manager?->name;
            }
        }
        if (!Schema::hasColumn('leave_requests', 'direct_manager_name')) {
            unset($data['direct_manager_name']);
        }
        if (!Schema::hasColumn('leave_requests', 'alternate_employee_name')) {
            unset($data['alternate_employee_name']);
        }
        if (!Schema::hasColumn('leave_requests', 'alternate_employee_id')) {
            unset($data['alternate_employee_id']);
        } elseif (empty($data['alternate_employee_id']) && !empty($data['alternate_employee_name'])) {
            $alternateMatches = Employee::active()
                ->where('name', 'like', trim($data['alternate_employee_name']) . '%')
                ->limit(2)
                ->get(['id']);
            if ($alternateMatches->count() === 1) {
                $data['alternate_employee_id'] = $alternateMatches->first()->id;
            }
        }
        // The official tracking sequence is reserved only at final approval.
        $data['tracking_no'] = null;
        $data['request_date'] = $data['request_date'] ?? now()->toDateString();

        if ($request->hasFile('medical_attachment') && ($data['leave_type'] ?? null) === 'sick') {
            $attachment = $request->file('medical_attachment');
            $data['medical_attachment_path'] = $attachment->store('leave-medical-attachments', 'local');
            $data['medical_attachment_name'] = $attachment->getClientOriginalName();
            $data['medical_attachment_mime'] = $attachment->getMimeType();
        }

        $leave = LeaveRequest::create($data);
        $this->notifyNewRequest($leave, $employee);

        if ($this->canViewConfidentialBalance($leave, auth()->user())) {
            $this->attachCurrentBalance($leave);
        } else {
            $leave->makeHidden('available_balance');
            $leave->makeHidden('casual_available_balance');
        }
        return response()->json(['success' => true, 'data' => $leave], 201);
    }

    public function show(LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (
            !in_array($user->role, ['admin', 'depot_manager', 'hr'], true)
            && !$user->hasPermission('leaves.approve_hr')
            && (int) $leaveRequest->user_id !== (int) $user->id
            && !$this->isDirectManager($leaveRequest, $user->id)
        ) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $relations = [
            'approver:id,name,e_signature,role',
            'rejecter:id,name,role',
            'managerApprover:id,name,e_signature,role',
            'hrApprover:id,name,e_signature,role',
            'cancellationRequester:id,name',
            'cancellationRejecter:id,name',
            'user:id,name,profile_photo_path',
            'employee:id,name,e_signature,direct_manager_id,user_id,user_manager_id',
            'employee.user:id,name,e_signature',
            'employee.directManager:id,name,position,user_id,e_signature',
            'employee.directManager.user:id,name,role,e_signature',
            'employee.userManager:id,name,role,e_signature',
            'alternateEmployee:id,name,e_signature,user_id',
            'alternateEmployee.user:id,name,e_signature',
        ];
        if (Schema::hasTable('leave_request_amendments')) {
            array_push($relations,
                'pendingAmendment.requester:id,name',
                'amendments.requester:id,name',
                'amendments.reviewer:id,name'
            );
        }
        $leave = $leaveRequest->load($relations);

        // A signature may have been uploaded from Workforce or saved on the
        // employee's linked login account. Forms should accept either source.
        if ($leave->employee && !$leave->employee->e_signature && $leave->employee->user?->e_signature) {
            $leave->employee->setAttribute('e_signature', $leave->employee->user->e_signature);
        }

        $alternateEmployee = $leave->alternateEmployee;
        if (!$alternateEmployee && $leave->alternate_employee_name) {
            $alternateMatches = Employee::withTrashed()
                ->where('name', 'like', trim($leave->alternate_employee_name) . '%')
                ->limit(2)
                ->get(['id', 'name', 'e_signature', 'user_id']);
            $alternateEmployee = $alternateMatches->count() === 1 ? $alternateMatches->first() : null;
            $alternateEmployee?->load('user:id,name,e_signature');
        }
        if ($alternateEmployee && !$alternateEmployee->e_signature && $alternateEmployee->user?->e_signature) {
            $alternateEmployee->setAttribute('e_signature', $alternateEmployee->user->e_signature);
        }

        if ($leave->employee && $leave->employee->userManager) {
            $managerUser = $leave->employee->userManager;
            $managerUser->setAttribute('employee_record', Employee::active()->where('user_id', $managerUser->id)
                ->select('id', 'name', 'position', 'department')
                ->first());
        }

        // Word/print always use the people currently assigned in the database,
        // not an admin account that may have clicked an approval on their behalf.
        $directManagerEmployee = $leave->employee?->directManager;
        $directManagerUser = $leave->employee?->userManager ?: $directManagerEmployee?->user;
        $hrOfficer = User::where('role', 'hr')->where('is_active', true)
            ->first(['id', 'name', 'role', 'e_signature']);
        $depotManager = User::where('role', 'depot_manager')->where('is_active', true)
            ->first(['id', 'name', 'role', 'e_signature']);
        $hrEmployee = $hrOfficer
            ? Employee::active()->where('user_id', $hrOfficer->id)->first(['id', 'name', 'e_signature'])
            : null;
        $depotEmployee = $depotManager
            ? Employee::active()->where('user_id', $depotManager->id)->first(['id', 'name', 'e_signature'])
            : null;
        $leave->setAttribute('signature_parties', [
            'employee' => $leave->employee ? [
                'id' => $leave->employee->id,
                'name' => $leave->employee->name,
                'e_signature' => $leave->employee->e_signature,
            ] : null,
            'alternate_employee' => $alternateEmployee ? [
                'id' => $alternateEmployee->id,
                'name' => $leave->alternate_employee_name ?: $alternateEmployee->name,
                'e_signature' => $alternateEmployee->e_signature,
            ] : null,
            'direct_manager' => ($directManagerEmployee || $directManagerUser) ? [
                'id' => $directManagerEmployee?->id ?? $directManagerUser?->id,
                'name' => $leave->direct_manager_name ?: ($directManagerEmployee?->name ?? $directManagerUser?->name),
                'role' => $directManagerUser?->role,
                'e_signature' => $leave->manager_approved_at
                    ? ($directManagerEmployee?->e_signature ?: $directManagerUser?->e_signature)
                    : null,
            ] : null,
            'hr' => $hrOfficer ? [
                'id' => $hrOfficer->id,
                'name' => $hrEmployee?->name ?: $hrOfficer->name,
                'role' => $hrOfficer->role,
                // Signatures uploaded from Workforce belong to the employee
                // record and are the authoritative source for HR forms.
                'e_signature' => $leave->hr_approved_at
                    ? ($hrEmployee?->e_signature ?: $hrOfficer->e_signature)
                    : null,
            ] : null,
            'depot_manager' => $depotManager ? [
                'id' => $depotManager->id,
                'name' => $depotEmployee?->name ?: $depotManager->name,
                'role' => $depotManager->role,
                'e_signature' => $leave->approved_at
                    ? ($depotEmployee?->e_signature ?: $depotManager->e_signature)
                    : null,
            ] : null,
        ]);

        if ($this->canViewConfidentialBalance($leave, $user)) {
            $this->attachCurrentBalance($leave);
        } else {
            $leave->makeHidden('available_balance');
            $leave->makeHidden('casual_available_balance');
        }
        $this->attachWorkflowAccess(collect([$leave]), $user);
        return response()->json(['success' => true, 'data' => $leave]);
    }

    public function medicalAttachment(LeaveRequest $leaveRequest)
    {
        $user = auth()->user();
        abort_unless(
            in_array($user->role, ['admin', 'depot_manager', 'hr'], true)
                || $user->hasPermission('leaves.approve_hr')
                || (int) $leaveRequest->user_id === (int) $user->id
                || $this->isDirectManager($leaveRequest, $user->id),
            403,
            'Unauthorized'
        );
        abort_unless(
            $leaveRequest->type === 'lrf'
                && $leaveRequest->leave_type === 'sick'
                && $leaveRequest->medical_attachment_path
                && Storage::disk('local')->exists($leaveRequest->medical_attachment_path),
            404,
            'Medical attachment not found.'
        );

        return response()->file(
            Storage::disk('local')->path($leaveRequest->medical_attachment_path),
            [
                'Content-Type' => $leaveRequest->medical_attachment_mime ?: 'application/octet-stream',
                'Content-Disposition' => 'inline; filename="medical-attachment"',
                'Cache-Control' => 'private, no-store',
            ]
        );
    }

    public function managerApprove(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'depot_manager']) && !$this->isDirectManager($leaveRequest, $user->id)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if ($leaveRequest->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Request is not pending'], 422);
        }

        $changes = $this->validatedApprovalRequestChanges($request, $leaveRequest);
        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';

        $leaveRequest->update(array_merge($changes, [
            'status' => 'manager_approved',
            'manager_approved_by' => $user->id,
            'manager_approved_at' => now(),
            'manager_signature' => $user->e_signature ?? null,
        ]));

        $this->notifyHr($leaveRequest, $leaveRequest->type . '_manager_approved', "{$typeLabel} - HR Approval Required", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was approved by {$user->name}. Awaiting HR approval.");
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_manager_approved', "{$typeLabel} - Manager Approved", "Your {$typeLabel} ({$leaveRequest->tracking_no}) was approved by your direct manager. Awaiting HR approval.", ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    public function hrApprove(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'hr'], true) && !$user->hasPermission('leaves.approve_hr')) {
            return response()->json(['success' => false, 'message' => 'Only HR can approve this step'], 403);
        }
        $employee = $leaveRequest->employee_id
            ? Employee::active()->find($leaveRequest->employee_id)
            : null;
        $managerStepCanBeSkipped = $leaveRequest->status === 'pending'
            && $employee
            && !$this->directManagerUserId($employee);

        if ($leaveRequest->status !== 'manager_approved' && !$managerStepCanBeSkipped) {
            return response()->json(['success' => false, 'message' => 'Request is not awaiting HR approval'], 422);
        }

        $changes = $this->validatedApprovalRequestChanges($request, $leaveRequest);

        DB::transaction(function () use ($leaveRequest, $changes, $user) {
            $leaveRequest->update(array_merge($changes, [
                'status' => 'hr_approved',
                'hr_approved_by' => $user->id,
                'hr_approved_at' => now(),
                'hr_signature' => $user->e_signature ?? null,
            ]));
        });

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        // Depot manager now owns the final step — push.
        Notification::notifyRole('depot_manager', $leaveRequest->type . '_hr_approved', "{$typeLabel} - Depot Approval Required", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was approved by HR {$user->name}. Awaiting Depot Manager final approval.", ['leave_request_id' => $leaveRequest->id], true);
        Notification::notifyRole('admin', $leaveRequest->type . '_hr_approved', "{$typeLabel} - HR Approved", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was approved by HR {$user->name}.", ['leave_request_id' => $leaveRequest->id]);
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_hr_approved', "{$typeLabel} - HR Approved", "Your {$typeLabel} ({$leaveRequest->tracking_no}) was approved by HR. Awaiting Depot Manager final approval.", ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    public function approve(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'depot_manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (!in_array($leaveRequest->status, ['pending', 'manager_approved', 'hr_approved'], true)) {
            return response()->json(['success' => false, 'message' => 'Request is not awaiting approval'], 422);
        }

        $changes = $this->validatedApprovalRequestChanges($request, $leaveRequest);

        // Depot Manager and Super Admin may finalize an outstanding request directly.
        // Skipped approval stages remain unsigned so the printed form stays truthful.
        DB::transaction(function () use ($leaveRequest, $changes, $user) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            $employee = $locked->employee_id
                ? Employee::withTrashed()->find($locked->employee_id)
                : null;
            $trackingNo = $locked->tracking_no ?: $this->generateTrackingNo($locked->type, $employee);

            $leaveRequest->update(array_merge($changes, [
                'tracking_no' => $trackingNo,
                'status' => 'approved',
                'approved_by' => $user->id,
                'approved_at' => now(),
                'depot_signature' => $user->e_signature ?? null,
            ]));

            $this->resequenceFinalizedTrackingNumbers($this->trackingPrefix($locked->type, $employee));
        });

        $leaveRequest->refresh();

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_approved', "{$typeLabel} Approved", "Your {$typeLabel} ({$leaveRequest->tracking_no}) has been fully approved by {$user->name}. It is ready to print.", ['leave_request_id' => $leaveRequest->id]);
        }
        Notification::notifyRole('admin', $leaveRequest->type . '_approved', "{$typeLabel} Fully Approved", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was fully approved by {$user->name}.", ['leave_request_id' => $leaveRequest->id]);
        Notification::notifyRole('hr', $leaveRequest->type . '_approved', "{$typeLabel} Fully Approved", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was fully approved by Depot Manager {$user->name}.", ['leave_request_id' => $leaveRequest->id]);

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    // Save reviewer edits (OTR timing / LRF leave classification) WITHOUT approving.
    // Any user who could approve a stage on this request may also save its details.
    public function updateDetails(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $canApproveManager = in_array($user->role, ['admin', 'depot_manager'], true)
            || $this->isDirectManager($leaveRequest, $user->id);
        $canApproveHr = in_array($user->role, ['admin', 'hr'], true)
            || $user->hasPermission('leaves.approve_hr');
        $canApproveDepot = in_array($user->role, ['admin', 'depot_manager'], true);

        if (!($canApproveManager || $canApproveHr || $canApproveDepot)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if (in_array($leaveRequest->status, ['approved', 'rejected', 'cancelled'], true)) {
            return response()->json(['success' => false, 'message' => 'Request is already finalized'], 422);
        }

        $changes = $this->validatedApprovalRequestChanges($request, $leaveRequest);
        if (empty($changes)) {
            return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
        }

        $leaveRequest->update($changes);

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    public function reject(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $canHrAct = ($user->role === 'hr' || $user->hasPermission('leaves.approve_hr'))
            && $leaveRequest->status === 'manager_approved';
        if (!in_array($user->role, ['admin', 'depot_manager']) && !$this->isDirectManager($leaveRequest, $user->id) && !$canHrAct) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (in_array($leaveRequest->status, ['approved', 'rejected', 'cancelled'])) {
            return response()->json(['success' => false, 'message' => 'Request already processed'], 422);
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ], [
            'reason.required' => 'A rejection reason is required.',
            'reason.min' => 'Please provide a clear rejection reason of at least 5 characters.',
        ]);

        $trackingNo = $leaveRequest->tracking_no;
        $leaveRequest->update([
            'tracking_no' => null,
            'status' => 'rejected',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'rejection_reason' => trim($validated['reason']),
            'rejected_by' => $user->id,
            'rejected_at' => now(),
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        if ($leaveRequest->user_id) {
            Notification::notifyUser(
                $leaveRequest->user_id,
                $leaveRequest->type . '_rejected',
                "{$typeLabel} Rejected",
                "Your {$typeLabel} ({$trackingNo}) was rejected by {$user->name}. Reason: {$validated['reason']}",
                ['leave_request_id' => $leaveRequest->id],
                true,
                ['priority' => 'warn']
            );
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver', 'rejecter'])]);
    }

    public function reschedule(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $canHrAct = $user->role === 'hr' && $leaveRequest->status === 'manager_approved';
        if (!in_array($user->role, ['admin', 'depot_manager']) && !$this->isDirectManager($leaveRequest, $user->id) && !$canHrAct) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (!in_array($leaveRequest->status, ['pending', 'manager_approved', 'hr_approved'])) {
            return response()->json(['success' => false, 'message' => 'Cannot reschedule this request'], 422);
        }

        $trackingNo = $leaveRequest->tracking_no;
        $leaveRequest->update([
            'tracking_no' => null,
            'status' => 'rescheduled',
            'rescheduled_by' => $user->id,
            'rescheduled_at' => now(),
            'reschedule_reason' => $request->input('reason'),
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $reason = $request->input('reason') ? ' - ' . $request->input('reason') : '';
        $event = $leaveRequest->type === 'lrf' ? 'lrf_rescheduled' : 'otr_rescheduled';
        if ($leaveRequest->user_id) {
            Notification::notifyUser(
                $leaveRequest->user_id,
                $event,
                "{$typeLabel} - Reschedule Required",
                "Your {$typeLabel} ({$trackingNo}) needs to be rescheduled by {$user->name}{$reason}. Please submit a new request.",
                ['leave_request_id' => $leaveRequest->id],
                true,
                ['priority' => 'warn']
            );
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh()]);
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $isOwner = $leaveRequest->user_id === $user->id;
        $isApproverAccount = in_array($user->role, ['admin', 'depot_manager', 'hr', 'manager'], true);

        if (!$isOwner || $isApproverAccount) {
            return response()->json([
                'success' => false,
                'message' => 'Only the staff account that submitted this request can withdraw it. Approvers must reject it instead.',
            ], 403);
        }
        if (in_array($leaveRequest->status, ['cancelled', 'rejected', 'rescheduled', 'cancellation_pending', 'amendment_pending'], true)) {
            return response()->json(['success' => false, 'message' => 'Cannot cancel this request'], 422);
        }

        $request->validate(['reason' => 'nullable|string|max:2000']);

        // Final approval stays effective until Depot/Admin accepts the cancellation.
        if ($leaveRequest->status === 'approved') {
            $leaveRequest->update([
                'status' => 'cancellation_pending',
                'requested_cancellation_at' => now(),
                'requested_cancellation_by' => $user->id,
                'cancellation_reason' => $request->input('reason'),
                'cancellation_rejected_at' => null,
                'cancellation_rejected_by' => null,
                'cancellation_rejection_reason' => null,
            ]);

            $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
            $message = "{$leaveRequest->employee_name} requested cancellation of {$typeLabel} ({$leaveRequest->tracking_no}).";
            Notification::notifyRole(
                'depot_manager',
                $leaveRequest->type . '_cancellation_requested',
                "{$typeLabel} Cancellation Approval Required",
                $message,
                ['leave_request_id' => $leaveRequest->id, 'request_type' => $leaveRequest->type],
                true
            );

            return response()->json([
                'success' => true,
                'message' => 'Cancellation request submitted for Depot Manager approval',
                'data' => $leaveRequest->fresh(['cancellationRequester:id,name']),
            ]);
        }

        $leaveRequest->update([
            'tracking_no' => null,
            'status' => 'cancelled',
            'cancelled_by' => $user->id,
            'cancelled_at' => now(),
            'cancellation_reason' => $request->input('reason'),
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $msg = "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was cancelled by {$user->name}.";
        Notification::notifyRole('admin', 'lrf_cancelled', "{$typeLabel} Cancelled", $msg, ['leave_request_id' => $leaveRequest->id]);
        Notification::notifyRole('depot_manager', 'lrf_cancelled', "{$typeLabel} Cancelled", $msg, ['leave_request_id' => $leaveRequest->id]);

        return response()->json([
            'success' => true,
            'message' => 'Request cancelled',
            'data' => $leaveRequest->fresh(['approver', 'canceller']),
        ]);
    }

    public function approveCancellation(LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        abort_unless(in_array($user->role, ['admin', 'depot_manager'], true), 403, 'Only Admin or Depot Manager can approve cancellation.');

        $leaveRequest = DB::transaction(function () use ($leaveRequest, $user) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            if ($locked->status !== 'cancellation_pending') {
                throw ValidationException::withMessages(['status' => 'This request is not awaiting cancellation approval.']);
            }

            // Restore only a balance that the deduction service actually consumed.
            if (
                $locked->type === 'lrf'
                && $locked->balance_deducted_at
                && $locked->employee_id
                && (float) $locked->days > 0
                && !$locked->company_paid
                && in_array($locked->leave_type, ['annual', 'casual', 'sick', 'early'], true)
            ) {
                $balance = LeaveBalance::where('employee_id', $locked->employee_id)->lockForUpdate()->first();
                $balance?->restore($locked->leave_type, (float) $locked->days);
            }

            $locked->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => $user->id,
            ]);

            return $locked;
        });

        $this->notifyCancellationDecision($leaveRequest, true);

        return response()->json([
            'success' => true,
            'message' => 'Cancellation approved',
            'data' => $leaveRequest->fresh(['canceller:id,name']),
        ]);
    }

    public function rejectCancellation(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        abort_unless(in_array($user->role, ['admin', 'depot_manager'], true), 403, 'Only Admin or Depot Manager can reject cancellation.');
        $validated = $request->validate(['reason' => 'required|string|max:2000']);

        $leaveRequest = DB::transaction(function () use ($leaveRequest, $user, $validated) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            if ($locked->status !== 'cancellation_pending') {
                throw ValidationException::withMessages(['status' => 'This request is not awaiting cancellation approval.']);
            }

            $locked->update([
                'status' => 'approved',
                'cancellation_rejected_at' => now(),
                'cancellation_rejected_by' => $user->id,
                'cancellation_rejection_reason' => $validated['reason'],
            ]);

            return $locked;
        });

        $this->notifyCancellationDecision($leaveRequest, false);

        return response()->json([
            'success' => true,
            'message' => 'Cancellation rejected',
            'data' => $leaveRequest->fresh(['cancellationRejecter:id,name']),
        ]);
    }

    public function requestAmendment(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $canRequest = (int) $leaveRequest->user_id === (int) $user->id
            || $this->isDirectManager($leaveRequest, $user->id)
            || in_array($user->role, ['admin', 'depot_manager', 'hr'], true)
            || $user->hasPermission('leaves.approve_hr');
        abort_unless($canRequest, 403, 'You cannot request an amendment for this request.');

        $validated = $request->validate(['reason' => 'required|string|max:2000']);
        $changes = $this->validatedFinalAmendmentChanges($request, $leaveRequest);
        if (empty($changes)) {
            throw ValidationException::withMessages(['changes' => 'Change at least one request detail.']);
        }

        $amendment = DB::transaction(function () use ($leaveRequest, $user, $validated, $changes) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            if ($locked->status !== 'approved') {
                throw ValidationException::withMessages(['status' => 'Only a fully approved request can be amended.']);
            }
            if ($locked->amendments()->where('status', 'pending')->exists()) {
                throw ValidationException::withMessages(['status' => 'An amendment is already awaiting approval.']);
            }

            $original = collect(array_keys($changes))->mapWithKeys(
                fn ($field) => [$field => $this->serializableRequestValue($locked, $field)]
            )->all();
            $amendment = $locked->amendments()->create([
                'requested_by' => $user->id,
                'reason' => $validated['reason'],
                'original_data' => $original,
                'proposed_data' => $changes,
                'status' => 'pending',
            ]);
            $locked->update(['status' => 'amendment_pending']);

            return $amendment;
        });

        $label = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $data = ['leave_request_id' => $leaveRequest->id, 'request_type' => $leaveRequest->type];
        Notification::notifyRole('depot_manager', $leaveRequest->type . '_amendment_requested', "{$label} Amendment Required", "{$user->name} requested changes to {$leaveRequest->tracking_no}.", $data, true);
        Notification::notifyRole('admin', $leaveRequest->type . '_amendment_requested', "{$label} Amendment Required", "{$user->name} requested changes to {$leaveRequest->tracking_no}.", $data);

        return response()->json(['success' => true, 'message' => 'Amendment sent for Depot Manager approval', 'data' => $amendment->load('requester:id,name')]);
    }

    public function approveAmendment(LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        abort_unless(in_array($user->role, ['admin', 'depot_manager'], true), 403, 'Only Admin or Depot Manager can approve amendments.');

        $leaveRequest = DB::transaction(function () use ($leaveRequest, $user) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            if ($locked->status !== 'amendment_pending') {
                throw ValidationException::withMessages(['status' => 'This request is not awaiting amendment approval.']);
            }
            $amendment = $locked->amendments()->where('status', 'pending')->lockForUpdate()->firstOrFail();
            $changes = $amendment->proposed_data;

            if ($locked->type === 'lrf' && $locked->balance_deducted_at && $locked->employee_id) {
                $balance = LeaveBalance::where('employee_id', $locked->employee_id)->lockForUpdate()->first();
                if ($balance) {
                    if ($locked->paid !== false && !$locked->company_paid) {
                        $balance->restore($locked->leave_type, (float) $locked->days);
                    }
                    $changes['available_balance'] = $balance->getEffectiveRemaining('annual');
                    $changes['casual_available_balance'] = $balance->getEffectiveRemaining('casual');
                    $companyPaid = (bool) ($changes['company_paid'] ?? $locked->company_paid);
                    if (!$companyPaid && ($changes['paid'] ?? $locked->paid) !== false && !$balance->deduct($changes['leave_type'], (float) $changes['days'])) {
                        throw ValidationException::withMessages(['balance' => 'The employee does not have enough balance for the amended request.']);
                    }
                    $changes['balance_deducted_at'] = (!$companyPaid && ($changes['paid'] ?? $locked->paid) !== false) ? now() : null;
                }
            } elseif ($locked->type === 'lrf' && $locked->employee_id) {
                $available = $this->availableLeaveBalances((int) $locked->employee_id, (int) $locked->id);
                $changes['available_balance'] = $available['annual'];
                $changes['casual_available_balance'] = $available['casual'];
            }

            $locked->update(array_merge($changes, ['status' => 'approved']));
            $amendment->update(['status' => 'approved', 'reviewed_by' => $user->id, 'reviewed_at' => now()]);
            return $locked;
        });

        $this->notifyAmendmentDecision($leaveRequest, true);
        return response()->json(['success' => true, 'message' => 'Amendment approved', 'data' => $leaveRequest->fresh()]);
    }

    public function rejectAmendment(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        abort_unless(in_array($user->role, ['admin', 'depot_manager'], true), 403, 'Only Admin or Depot Manager can reject amendments.');
        $validated = $request->validate(['reason' => 'required|string|max:2000']);

        $leaveRequest = DB::transaction(function () use ($leaveRequest, $user, $validated) {
            $locked = LeaveRequest::lockForUpdate()->findOrFail($leaveRequest->id);
            if ($locked->status !== 'amendment_pending') {
                throw ValidationException::withMessages(['status' => 'This request is not awaiting amendment approval.']);
            }
            $amendment = $locked->amendments()->where('status', 'pending')->lockForUpdate()->firstOrFail();
            $amendment->update([
                'status' => 'rejected', 'reviewed_by' => $user->id,
                'reviewed_at' => now(), 'rejection_reason' => $validated['reason'],
            ]);
            $locked->update(['status' => 'approved']);
            return $locked;
        });

        $this->notifyAmendmentDecision($leaveRequest, false);
        return response()->json(['success' => true, 'message' => 'Amendment rejected', 'data' => $leaveRequest->fresh()]);
    }

    private function notifyAmendmentDecision(LeaveRequest $leaveRequest, bool $approved): void
    {
        $label = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $event = $leaveRequest->type . ($approved ? '_amendment_approved' : '_amendment_rejected');
        $title = "{$label} Amendment " . ($approved ? 'Approved' : 'Rejected');
        $body = "Changes to {$leaveRequest->tracking_no} were " . ($approved ? 'approved.' : 'rejected.');
        $data = ['leave_request_id' => $leaveRequest->id, 'request_type' => $leaveRequest->type];
        if ($leaveRequest->user_id) Notification::notifyUser($leaveRequest->user_id, $event, $title, $body, $data, true);
        Notification::notifyRole('hr', $event, $title, $body, $data);
        Notification::notifyRole('admin', $event, $title, $body, $data);
    }

    private function notifyCancellationDecision(LeaveRequest $leaveRequest, bool $approved): void
    {
        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $event = $leaveRequest->type . ($approved ? '_cancellation_approved' : '_cancellation_rejected');
        $title = "{$typeLabel} Cancellation " . ($approved ? 'Approved' : 'Rejected');
        $body = "Cancellation of {$typeLabel} ({$leaveRequest->tracking_no}) was " . ($approved ? 'approved.' : 'rejected.');
        $data = ['leave_request_id' => $leaveRequest->id, 'request_type' => $leaveRequest->type];

        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $event, $title, $body, $data, true);
        }
        if ($approved) {
            Notification::notifyRole('hr', $event, $title, $body, $data);
            Notification::notifyRole('admin', $event, $title, $body, $data);
        }
    }

    /**
     * Manually set / update the tracking_no on a leave or overtime request.
     * Allowed only for: admin, depot_manager, or any HR-department user.
     * Used right before printing so HR can stamp the official document number.
     */
    public function updateTrackingNo(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (!$user->isHR()) {
            return response()->json(['success' => false, 'message' => 'Only HR can edit the tracking number'], 403);
        }

        if ($leaveRequest->status !== 'approved') {
            return response()->json([
                'success' => false,
                'message' => 'Tracking numbers can only be edited after final approval.',
            ], 422);
        }

        $v = Validator::make($request->all(), [
            'tracking_no' => 'required|string|max:64',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $leaveRequest->update(['tracking_no' => $request->input('tracking_no')]);

        return response()->json([
            'success' => true,
            'message' => 'Tracking number updated',
            'data'    => $leaveRequest->fresh(['approver', 'managerApprover', 'employee']),
        ]);
    }

    public function calendar(): JsonResponse
    {
        $this->deductions->processDue();

        $requests = LeaveRequest::where('type', 'lrf')
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->select('id', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days', 'department_label', 'approved_at', 'balance_deducted_at')
            ->orderBy('start_date')
            ->get();

        return response()->json(['success' => true, 'data' => $requests]);
    }

    private function notifyNewRequest(LeaveRequest $leave, ?Employee $employee): void
    {
        $typeLabel = $leave->type === 'lrf' ? 'Leave Request' : 'Overtime Request';

        if ($leave->status === 'manager_approved') {
            $this->notifyHr(
                $leave,
                $leave->type . '_manager_skipped',
                "{$typeLabel} - HR Approval Required",
                "{$leave->employee_name}'s {$typeLabel} ({$leave->tracking_no}) has no direct manager assigned. The manager step was skipped and the request is awaiting HR approval."
            );
            return;
        }

        $hasDirectManager = false;

        if ($employee?->user_manager_id) {
            $hasDirectManager = true;
            // Direct manager must approve — push.
            Notification::notifyUser($employee->user_manager_id, 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. Awaiting your approval.", ['leave_request_id' => $leave->id], true);
        } elseif ($employee?->direct_manager_id) {
            $managerEmp = Employee::active()->find($employee->direct_manager_id);
            if ($managerEmp?->user_id) {
                $hasDirectManager = true;
                Notification::notifyUser($managerEmp->user_id, 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. Awaiting your approval.", ['leave_request_id' => $leave->id], true);
            }
        }

        if (!$hasDirectManager) {
            // No direct manager set — depot manager owns the manager step, push.
            Notification::notifyRole('depot_manager', 'new_' . $leave->type, "New {$typeLabel} - Direct Approval Required", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. No direct manager assigned. Awaiting your approval.", ['leave_request_id' => $leave->id], true);
        }

        // Informational only — HR gets a real push when it becomes their turn (after manager approves).
        Notification::notifyRole('hr', 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. HR review will be required after manager approval.", ['leave_request_id' => $leave->id]);
        Notification::notifyRole('admin', 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}", ['leave_request_id' => $leave->id]);
    }

    private function directManagerUserId(Employee $employee): ?int
    {
        if ($employee->user_manager_id && User::whereKey($employee->user_manager_id)->where('is_active', true)->exists()) {
            return (int) $employee->user_manager_id;
        }

        if (!$employee->direct_manager_id) {
            return null;
        }

        $managerUserId = Employee::active()
            ->whereKey($employee->direct_manager_id)
            ->value('user_id');

        if (!$managerUserId || !User::whereKey($managerUserId)->where('is_active', true)->exists()) {
            return null;
        }

        return (int) $managerUserId;
    }

    private function notifyHr(LeaveRequest $leave, string $type, string $title, string $body): void
    {
        $data = ['leave_request_id' => $leave->id];
        // HR now owns the pending step — push. Admins get in-app only.
        Notification::notifyRole('hr', $type, $title, $body, $data, true);
        Notification::notifyRole('admin', $type, $title, $body, $data);
    }

    private function isDirectManager(LeaveRequest $leaveRequest, int $userId): bool
    {
        $employee = $leaveRequest->employee_id
            ? Employee::active()->find($leaveRequest->employee_id)
            : $this->uniqueActiveEmployeeByName($leaveRequest->employee_name);
        if (!$employee) {
            return false;
        }

        if ($employee->user_manager_id && $employee->user_manager_id === $userId) {
            return true;
        }

        if ($employee->direct_manager_id) {
            $managerEmp = Employee::active()->find($employee->direct_manager_id);
            return $managerEmp && $managerEmp->user_id === $userId;
        }

        return false;
    }

    private function uniqueActiveEmployeeByName(?string $name): ?Employee
    {
        $normalized = strtolower(trim((string) $name));
        if ($normalized === '') {
            return null;
        }

        $matches = Employee::active()
            ->whereRaw('LOWER(TRIM(name)) = ?', [$normalized])
            ->limit(2)
            ->get();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    private function attachWorkflowAccess($requests, User $user): void
    {
        $isDepotAdmin = in_array($user->role, ['admin', 'depot_manager'], true);
        $isHr = in_array($user->role, ['admin', 'hr'], true)
            || $user->hasPermission('leaves.approve_hr');

        foreach ($requests as $request) {
            $isDirectManager = $this->isDirectManager($request, $user->id);
            $employee = $request->employee
                ?: ($request->employee_id
                    ? Employee::active()->find($request->employee_id)
                    : $this->uniqueActiveEmployeeByName($request->employee_name));
            $managerCanBeSkipped = $employee && !$this->directManagerUserId($employee);

            $request->setAttribute(
                'can_approve_manager',
                $request->status === 'pending' && ($isDepotAdmin || $isDirectManager)
            );
            $request->setAttribute('is_direct_manager', $isDirectManager);
            $request->setAttribute('manager_step_can_be_skipped', (bool) $managerCanBeSkipped);
            $request->setAttribute(
                'can_approve_hr',
                $isHr && (
                    $request->status === 'manager_approved'
                    || ($request->status === 'pending' && $managerCanBeSkipped)
                )
            );
            $request->setAttribute(
                'can_approve_depot',
                $isDepotAdmin && in_array($request->status, ['pending', 'manager_approved', 'hr_approved'], true)
            );
            $request->setAttribute(
                'can_approve_cancellation',
                $isDepotAdmin && $request->status === 'cancellation_pending'
            );
            $request->setAttribute(
                'can_approve_amendment',
                $isDepotAdmin && $request->status === 'amendment_pending'
            );
        }
    }

    private function generateTrackingNo(string $type, ?Employee $employee = null): string
    {
        $prefix = $this->trackingPrefix($type, $employee);

        $next = LeaveRequest::where('tracking_no', 'like', $prefix . '%')
            ->whereNotNull('tracking_no')
            ->lockForUpdate()
            ->pluck('tracking_no')
            ->map(function ($tracking) use ($prefix) {
                $tail = substr((string) $tracking, strlen($prefix));
                return ctype_digit($tail) ? (int) $tail : 0;
            })
            ->max() + 1;

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function trackingPrefix(string $type, ?Employee $employee = null): string
    {
        return ($type === 'lrf' ? 'LRF' : 'OTR')
            . '-' . ($employee?->projectCode() ?? 'EG1')
            . '-';
    }

    private function resequenceFinalizedTrackingNumbers(string $prefix): void
    {
        $ids = LeaveRequest::query()
            ->where('tracking_no', 'like', $prefix . '%')
            ->where(function ($query) {
                $query->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
                    ->orWhere(function ($cancelled) {
                        $cancelled->where('status', 'cancelled')->whereNotNull('approved_at');
                    });
            })
            ->orderByRaw('COALESCE(request_date, DATE(created_at))')
            ->orderBy('created_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->pluck('id')
            ->all();

        foreach ($ids as $id) {
            LeaveRequest::whereKey($id)->update(['tracking_no' => '__TRACKING_RENUMBER__' . $id]);
        }

        foreach (array_values($ids) as $index => $id) {
            LeaveRequest::whereKey($id)->update([
                'tracking_no' => $prefix . str_pad((string) ($index + 1), 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    private function availableLeaveBalances(int $employeeId, ?int $excludeRequestId = null): array
    {
        $this->leaveYears->refreshDue($employeeId);
        $balance = LeaveBalance::firstOrCreate(
            ['employee_id' => $employeeId],
            [
                'annual' => 21,
                'casual' => 7,
                'sick' => 90,
                'early' => 0,
                'leave_cycle_started_on' => $this->leaveYears->currentCycleStart()->toDateString(),
            ]
        );

        $reserved = LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('employee_id', $employeeId)
            ->whereNull('balance_deducted_at')
            ->where(function ($q) {
                $q->where('company_paid', false)->orWhereNull('company_paid');
            })
            ->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'approved', 'cancellation_pending', 'amendment_pending'])
            ->whereIn('leave_type', ['annual', 'casual', 'sick', 'early'])
            ->where('days', '>', 0)
            ->where(function ($q) {
                $q->where('paid', true)->orWhereNull('paid');
            })
            ->when($excludeRequestId, fn ($q) => $q->where('id', '!=', $excludeRequestId))
            ->selectRaw('leave_type, SUM(days) as days')
            ->groupBy('leave_type')
            ->pluck('days', 'leave_type');

        $annualLeft = $balance->getEffectiveRemaining('annual')
            - (float) ($reserved['annual'] ?? 0)
            - (float) ($reserved['casual'] ?? 0)
            - (float) ($reserved['early'] ?? 0);
        $casualLeft = $balance->getEffectiveRemaining('casual') - (float) ($reserved['casual'] ?? 0);
        $sickLeft   = $balance->getEffectiveRemaining('sick') - (float) ($reserved['sick'] ?? 0);

        return [
            'annual' => max(0, $annualLeft),
            'casual' => max(0, min($annualLeft, $casualLeft)),
            'sick' => max(0, $sickLeft),
        ];
    }

    private function hasAvailableLeaveBalance(int $employeeId, string $type, float $days, ?int $excludeRequestId = null): bool
    {
        $available = $this->availableLeaveBalances($employeeId, $excludeRequestId);

        return match ($type) {
            'annual', 'early' => $available['annual'] >= $days,
            'casual' => $available['casual'] >= $days,
            'sick' => $available['sick'] >= $days,
            default => true,
        };
    }

    private function canViewConfidentialBalance(LeaveRequest $leaveRequest, User $user): bool
    {
        if (in_array($user->role, ['admin', 'depot_manager', 'hr'], true)) {
            return true;
        }

        if ($this->isDirectManager($leaveRequest, $user->id)) {
            return true;
        }

        return in_array($leaveRequest->status, ['approved', 'cancellation_pending', 'amendment_pending'], true)
            && (int) $leaveRequest->user_id === (int) $user->id;
    }

    private function attachArchiveStatus($requests, User $user): void
    {
        if (
            !(in_array($user->role, ['admin', 'hr'], true) || $user->hasPermission('leaves.approve_hr'))
            || !Schema::hasTable('leave_request_archives')
            || $requests->isEmpty()
        ) {
            return;
        }

        $archivedIds = DB::table('leave_request_archives')
            ->whereIn('leave_request_id', $requests->pluck('id'))
            ->pluck('leave_request_id')
            ->map(fn ($id) => (int) $id)
            ->flip();

        foreach ($requests as $leaveRequest) {
            $leaveRequest->setAttribute('archived_by_me', $archivedIds->has((int) $leaveRequest->id));
        }
    }

    private function ensureHrArchiveAccess(User $user): void
    {
        abort_unless(
            in_array($user->role, ['admin', 'hr'], true) || $user->hasPermission('leaves.approve_hr'),
            403,
            'Only HR or Super Admin can archive printed requests.'
        );
    }

    private function hideConfidentialBalances($requests, User $user): void
    {
        foreach ($requests as $leaveRequest) {
            if (!$this->canViewConfidentialBalance($leaveRequest, $user)) {
                $leaveRequest->makeHidden('available_balance');
                $leaveRequest->makeHidden('casual_available_balance');
            }
        }
    }

    private function attachCurrentBalance(LeaveRequest $leaveRequest): void
    {
        // The request stores the balance snapshot from submission time.
        // Never replace it with the employee's later live balance because
        // approved documents must remain historically accurate.
        if (
            $leaveRequest->type === 'lrf'
            && $leaveRequest->leave_type === 'sick'
            && $leaveRequest->employee_id
        ) {
            // Older sick requests stored the sick entitlement in the generic
            // snapshot field. Supply a document-only total without rewriting
            // their historical database record.
            $available = $this->availableLeaveBalances(
                (int) $leaveRequest->employee_id,
                (int) $leaveRequest->id
            );
            $leaveRequest->setAttribute('document_available_balance', $available['annual']);
        }
    }

    private function validatedApprovalRequestChanges(Request $request, LeaveRequest $leaveRequest): array
    {
        if ($leaveRequest->type === 'otr') {
            if (!$request->hasAny(['ot_date', 'start_time', 'end_time'])) {
                return [];
            }

            $validated = $request->validate([
                'ot_date' => 'sometimes|required|date',
                'start_time' => 'sometimes|required|date_format:H:i',
                'end_time' => 'sometimes|required|date_format:H:i',
            ]);
            $date = $validated['ot_date'] ?? $leaveRequest->ot_date?->format('Y-m-d');
            $start = $validated['start_time'] ?? substr((string) $leaveRequest->start_time, 0, 5);
            $end = $validated['end_time'] ?? substr((string) $leaveRequest->end_time, 0, 5);
            $hours = $this->overtimeHours($date, $start, $end);
            if ($hours === null) {
                throw ValidationException::withMessages([
                    'end_time' => 'Overtime end time must be after start time and within 24 hours.',
                ]);
            }

            return [
                'ot_date' => $date,
                'start_time' => $start,
                'end_time' => $end,
                'hours' => $hours,
            ];
        }

        if ($leaveRequest->type !== 'lrf' || !$request->hasAny(['leave_type', 'paid', 'company_paid', 'company_paid_purpose', 'purpose', 'early_from', 'early_to'])) {
            return [];
        }

        $validated = $request->validate([
            'leave_type' => 'sometimes|required|in:annual,casual,sick,early',
            'paid' => 'sometimes|required|boolean',
            'company_paid' => 'sometimes|required|boolean',
            'company_paid_purpose' => 'nullable|in:business_trip,company_premises,marriage,exam,paternity,other',
            'purpose' => 'nullable|string|max:1000',
            'early_from' => 'nullable|required_if:leave_type,early|date_format:H:i',
            'early_to' => 'nullable|required_if:leave_type,early|date_format:H:i',
        ]);

        $leaveType = $validated['leave_type'] ?? $leaveRequest->leave_type;
        $paid = array_key_exists('paid', $validated) ? (bool) $validated['paid'] : (bool) $leaveRequest->paid;
        $companyPaid = array_key_exists('company_paid', $validated) ? (bool) $validated['company_paid'] : (bool) $leaveRequest->company_paid;
        if ($companyPaid) {
            $purposeData = array_merge($validated, [
                'company_paid_purpose' => $validated['company_paid_purpose'] ?? $leaveRequest->company_paid_purpose,
                'purpose' => $validated['purpose'] ?? $leaveRequest->purpose,
            ]);
            $this->validateCompanyPaidPurpose($purposeData);
            $paid = true;
        }
        $days = (float) $leaveRequest->days;
        $changes = [];

        if ($leaveType === 'early') {
            $from = $validated['early_from'] ?? substr((string) $leaveRequest->early_from, 0, 5);
            $to = $validated['early_to'] ?? substr((string) $leaveRequest->early_to, 0, 5);
            if (!$from || !$to) {
                throw ValidationException::withMessages([
                    'early_from' => 'Early Leave From and To times are required.',
                ]);
            }
            $earlyDays = $this->earlyLeaveDays($from, $to);
            if ($earlyDays === null) {
                throw ValidationException::withMessages([
                    'early_to' => 'Early Leave must be between 1 minute and 6 hours, and To time must be after From time.',
                ]);
            }
            $days = $earlyDays;
            $changes['early_from'] = $from;
            $changes['early_to'] = $to;
        } else {
            $changes['early_from'] = null;
            $changes['early_to'] = null;
            $employee = $leaveRequest->employee_id ? Employee::find($leaveRequest->employee_id) : null;
            if ($employee && $leaveRequest->start_date) {
                $days = $this->workingLeaveDays(
                    $employee,
                    $leaveRequest->start_date->toDateString(),
                    ($leaveRequest->end_date ?? $leaveRequest->start_date)->toDateString()
                );
                if ((float) $leaveRequest->days !== $days) {
                    $changes['days'] = $days;
                }
            }
        }

        if (
            $paid && !$companyPaid
            && $leaveRequest->employee_id
            && $days > 0
            && !$this->hasAvailableLeaveBalance(
                $leaveRequest->employee_id,
                $leaveType,
                $days,
                $leaveRequest->id
            )
        ) {
            throw ValidationException::withMessages([
                'leave_type' => 'The employee does not have enough available leave balance for these changes.',
            ]);
        }

        return array_merge($changes, [
            'leave_type' => $leaveType,
            'paid' => $paid,
            'company_paid' => $companyPaid,
            'company_paid_purpose' => $companyPaid ? ($validated['company_paid_purpose'] ?? $leaveRequest->company_paid_purpose) : null,
            'purpose' => $companyPaid ? ($validated['purpose'] ?? $leaveRequest->purpose) : ($validated['purpose'] ?? $leaveRequest->purpose),
            'days' => $days,
        ]);
    }

    private function validatedFinalAmendmentChanges(Request $request, LeaveRequest $leaveRequest): array
    {
        if ($leaveRequest->type === 'otr') {
            $data = $request->validate([
                'ot_date' => 'required|date',
                'start_time' => 'required|date_format:H:i',
                'end_time' => 'required|date_format:H:i',
                'explanation' => 'required|string|max:2000',
                'overtime_results' => 'nullable|string|max:2000',
            ]);
            $hours = $this->overtimeHours($data['ot_date'], $data['start_time'], $data['end_time']);
            if ($hours === null) {
                throw ValidationException::withMessages(['end_time' => 'Overtime end time must be after start time and within 24 hours.']);
            }
            $data['hours'] = $hours;
            return $this->onlyChangedRequestValues($leaveRequest, $data);
        }

        $data = $request->validate([
            'leave_type' => 'required|in:annual,casual,sick,early',
            'paid' => 'required|boolean',
            'company_paid' => 'nullable|boolean',
            'company_paid_purpose' => 'nullable|in:business_trip,company_premises,marriage,exam,paternity,other',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'early_from' => 'nullable|required_if:leave_type,early|date_format:H:i',
            'early_to' => 'nullable|required_if:leave_type,early|date_format:H:i',
            'purpose' => 'nullable|string|max:1000',
        ]);
        $data['company_paid'] = (bool) ($data['company_paid'] ?? false);
        if ($data['company_paid']) {
            $this->validateCompanyPaidPurpose($data);
            $data['paid'] = true;
        } else {
            $data['company_paid_purpose'] = null;
        }
        if ($data['leave_type'] === 'early') {
            $data['days'] = $this->earlyLeaveDays($data['early_from'], $data['early_to']);
            if ($data['days'] === null) {
                throw ValidationException::withMessages(['early_to' => 'Early Leave must be between 1 minute and 6 hours.']);
            }
        } else {
            $employee = $leaveRequest->employee_id ? Employee::find($leaveRequest->employee_id) : null;
            $data['days'] = $employee
                ? $this->workingLeaveDays($employee, $data['start_date'], $data['end_date'])
                : \Carbon\Carbon::parse($data['start_date'])->diffInDays(\Carbon\Carbon::parse($data['end_date'])) + 1;
            $data['early_from'] = null;
            $data['early_to'] = null;
        }

        if ($data['paid'] && !$data['company_paid'] && !$leaveRequest->balance_deducted_at && $leaveRequest->employee_id && !$this->hasAvailableLeaveBalance(
            (int) $leaveRequest->employee_id,
            $data['leave_type'],
            (float) $data['days'],
            (int) $leaveRequest->id
        )) {
            throw ValidationException::withMessages(['leave_type' => 'The employee does not have enough available leave balance for these changes.']);
        }

        return $this->onlyChangedRequestValues($leaveRequest, $data);
    }

    private function onlyChangedRequestValues(LeaveRequest $leaveRequest, array $values): array
    {
        return collect($values)->filter(function ($value, $field) use ($leaveRequest) {
            return (string) $this->serializableRequestValue($leaveRequest, $field) !== (string) $value;
        })->all();
    }

    private function serializableRequestValue(LeaveRequest $leaveRequest, string $field): mixed
    {
        $value = $leaveRequest->{$field};
        if ($value instanceof \DateTimeInterface) return $value->format('Y-m-d');
        if ($field === 'paid') return (bool) $value;
        if (in_array($field, ['early_from', 'early_to', 'start_time', 'end_time'], true) && $value) {
            return substr((string) $value, 0, 5);
        }
        return $value;
    }

    private function validateCompanyPaidPurpose(array $data): void
    {
        $kind = $data['company_paid_purpose'] ?? null;
        $purpose = trim((string) ($data['purpose'] ?? ''));
        if (!$kind) {
            throw ValidationException::withMessages(['company_paid_purpose' => 'Choose the company-paid leave purpose.']);
        }
        if ($kind === 'other' && $purpose === '') {
            throw ValidationException::withMessages(['purpose' => 'Enter the reason for Other company-paid leave.']);
        }
    }

    private function workingLeaveDays(Employee $employee, string $startDate, string $endDate): float
    {
        $cursor = \Carbon\Carbon::parse($startDate)->startOfDay();
        $end = \Carbon\Carbon::parse($endDate)->startOfDay();
        $days = 0;

        while ($cursor->lte($end)) {
            if ($employee->isWorkingDay($cursor)) {
                $days++;
            }
            $cursor->addDay();
        }

        return (float) $days;
    }

    private function earlyLeaveDays(?string $from, ?string $to): ?float
    {
        if (!$from || !$to) {
            return null;
        }

        [$fromHour, $fromMinute] = array_map('intval', explode(':', substr($from, 0, 5)));
        [$toHour, $toMinute] = array_map('intval', explode(':', substr($to, 0, 5)));
        $minutes = ($toHour * 60 + $toMinute) - ($fromHour * 60 + $fromMinute);
        if ($minutes <= 0) {
            $minutes += 24 * 60;
        }

        return match (true) {
            $minutes >= 1 && $minutes <= 120 => 0.25,
            $minutes >= 121 && $minutes <= 240 => 0.5,
            $minutes >= 241 && $minutes <= 360 => 0.75,
            default => null,
        };
    }

    private function overtimeHours(?string $date, ?string $start, ?string $end): ?float
    {
        if (!$date || !$start || !$end) {
            return null;
        }

        $startAt = \Carbon\Carbon::parse("{$date} {$start}");
        $endAt = \Carbon\Carbon::parse("{$date} {$end}");
        if ($endAt->lte($startAt)) {
            $endAt->addDay();
        }
        $minutes = $startAt->diffInMinutes($endAt);

        return $minutes > 0 && $minutes <= 24 * 60
            ? (float) round($minutes / 60, 0, PHP_ROUND_HALF_UP)
            : null;
    }
}
