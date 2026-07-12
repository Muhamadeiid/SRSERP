<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\Notification;
use App\Models\User;
use App\Services\LeaveDeductionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class LeaveRequestController extends Controller
{
    public function __construct(private LeaveDeductionService $deductions)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->deductions->processDue();

        $user = auth()->user();
        $query = LeaveRequest::with([
            'approver:id,name,e_signature,role',
            'managerApprover:id,name,e_signature,role',
            'hrApprover:id,name,e_signature,role',
            'employee:id,name,e_signature,direct_manager_id,user_id,user_manager_id',
            'employee.directManager:id,name,position,user_id,e_signature',
            'employee.userManager:id,name,e_signature',
        ]);

        if (in_array($user->role, ['admin', 'depot_manager', 'hr'])) {
            // Full visibility.
        } elseif ($user->role === 'manager') {
            $myEmp = Employee::where('user_id', $user->id)->first();
            $empIds = $myEmp ? Employee::where('direct_manager_id', $myEmp->id)->pluck('id') : collect();
            $query->where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('employee_id', $empIds));
        } else {
            $query->where('user_id', $user->id);
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
                    $q->whereIn('status', ['pending', 'manager_approved', 'hr_approved'])
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
            return response()->json([
                'success'    => true,
                'data'       => $paginated->items(),
                'pagination' => [
                    'current_page' => $paginated->currentPage(),
                    'last_page'    => $paginated->lastPage(),
                    'per_page'     => $paginated->perPage(),
                    'total'        => $paginated->total(),
                ],
            ]);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
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
            'alternate_employee_name' => 'nullable|string|max:255',
            'employee_id' => 'nullable|exists:employees,id',
            'leave_type' => 'required_if:type,lrf|nullable|in:annual,casual,sick,early',
            'paid' => 'nullable|boolean',
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
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        if ($request->type === 'lrf' && $request->employee_id && $request->leave_type !== 'early') {
            $start = $request->start_date;
            $end = $request->end_date ?? $request->start_date;
            $conflict = LeaveRequest::where('employee_id', $request->employee_id)
                ->where('type', 'lrf')
                ->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'approved'])
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
        $data['user_id'] = auth()->id();
        $data['status'] = 'pending';
        $employee = !empty($data['employee_id']) ? Employee::find($data['employee_id']) : null;
        if (
            $data['type'] === 'lrf'
            && $employee
            && ($data['paid'] ?? true)
            && in_array($data['leave_type'] ?? null, ['annual', 'casual', 'sick', 'early'], true)
            && (float) ($data['days'] ?? 0) > 0
            && !$this->hasAvailableLeaveBalance($employee->id, $data['leave_type'], (float) $data['days'])
        ) {
            return response()->json([
                'success' => false,
                'message' => 'The employee does not have enough available leave balance for this request.',
            ], 422);
        }
        if (empty($data['direct_manager_name']) && $employee?->direct_manager_id) {
            $manager = Employee::with('user:id,role')->find($employee->direct_manager_id);
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
        $data['tracking_no'] = $this->generateTrackingNo($data['type'], $employee);
        $data['request_date'] = $data['request_date'] ?? now()->toDateString();

        $leave = LeaveRequest::create($data);
        $this->notifyNewRequest($leave, $employee);

        return response()->json(['success' => true, 'data' => $leave], 201);
    }

    public function show(LeaveRequest $leaveRequest): JsonResponse
    {
        $leave = $leaveRequest->load([
            'approver:id,name,e_signature,role',
            'managerApprover:id,name,e_signature,role',
            'hrApprover:id,name,e_signature,role',
            'employee:id,name,e_signature,direct_manager_id,user_id,user_manager_id',
            'employee.directManager:id,name,position,user_id,e_signature',
            'employee.userManager:id,name,e_signature',
        ]);

        if ($leave->employee && $leave->employee->userManager) {
            $managerUser = $leave->employee->userManager;
            $managerUser->setAttribute('employee_record', Employee::where('user_id', $managerUser->id)
                ->select('id', 'name', 'position', 'department')
                ->first());
        }

        return response()->json(['success' => true, 'data' => $leave]);
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

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';

        $leaveRequest->update([
            'status' => 'manager_approved',
            'manager_approved_by' => $user->id,
            'manager_approved_at' => now(),
            'manager_signature' => $user->e_signature ?? null,
        ]);

        $this->notifyHr($leaveRequest, $leaveRequest->type . '_manager_approved', "{$typeLabel} - HR Approval Required", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was approved by {$user->name}. Awaiting HR approval.");
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_manager_approved', "{$typeLabel} - Manager Approved", "Your {$typeLabel} ({$leaveRequest->tracking_no}) was approved by your direct manager. Awaiting HR approval.", ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    public function hrApprove(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'hr'])) {
            return response()->json(['success' => false, 'message' => 'Only HR can approve this step'], 403);
        }
        if ($leaveRequest->status !== 'manager_approved') {
            return response()->json(['success' => false, 'message' => 'Request is not awaiting HR approval'], 422);
        }

        $leaveRequest->update([
            'status' => 'hr_approved',
            'hr_approved_by' => $user->id,
            'hr_approved_at' => now(),
            'hr_signature' => $user->e_signature ?? null,
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        Notification::notifyRole('depot_manager', $leaveRequest->type . '_hr_approved', "{$typeLabel} - Depot Approval Required", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was approved by HR {$user->name}. Awaiting Depot Manager final approval.", ['leave_request_id' => $leaveRequest->id]);
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
        if ($leaveRequest->status !== 'hr_approved') {
            return response()->json(['success' => false, 'message' => 'Request must be approved by HR before Depot Manager final approval'], 422);
        }

        $leaveRequest->update([
            'status' => 'approved',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'depot_signature' => $user->e_signature ?? null,
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_approved', "{$typeLabel} Approved", "Your {$typeLabel} ({$leaveRequest->tracking_no}) has been fully approved by {$user->name}. It is ready to print.", ['leave_request_id' => $leaveRequest->id]);
        }
        Notification::notifyRole('admin', $leaveRequest->type . '_approved', "{$typeLabel} Fully Approved", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was fully approved by {$user->name}.", ['leave_request_id' => $leaveRequest->id]);
        Notification::notifyRole('hr', $leaveRequest->type . '_approved', "{$typeLabel} Fully Approved", "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was fully approved by Depot Manager {$user->name}.", ['leave_request_id' => $leaveRequest->id]);

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh(['approver:id,name,e_signature,role', 'managerApprover:id,name,e_signature,role', 'hrApprover:id,name,e_signature,role'])]);
    }

    public function reject(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $canHrAct = $user->role === 'hr' && $leaveRequest->status === 'manager_approved';
        if (!in_array($user->role, ['admin', 'depot_manager']) && !$this->isDirectManager($leaveRequest, $user->id) && !$canHrAct) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (in_array($leaveRequest->status, ['approved', 'rejected', 'cancelled'])) {
            return response()->json(['success' => false, 'message' => 'Request already processed'], 422);
        }

        $leaveRequest->update([
            'status' => 'rejected',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'rejection_reason' => $request->input('reason'),
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $leaveRequest->type . '_rejected', "{$typeLabel} Rejected", "Your {$typeLabel} ({$leaveRequest->tracking_no}) was rejected by {$user->name}." . ($request->input('reason') ? ' Reason: ' . $request->input('reason') : ''), ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh('approver')]);
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

        $leaveRequest->update([
            'status' => 'rescheduled',
            'rescheduled_by' => $user->id,
            'rescheduled_at' => now(),
            'reschedule_reason' => $request->input('reason'),
        ]);

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $reason = $request->input('reason') ? ' - ' . $request->input('reason') : '';
        $event = $leaveRequest->type === 'lrf' ? 'lrf_rescheduled' : 'otr_rescheduled';
        if ($leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, $event, "{$typeLabel} - Reschedule Required", "Your {$typeLabel} ({$leaveRequest->tracking_no}) needs to be rescheduled by {$user->name}{$reason}. Please submit a new request.", ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json(['success' => true, 'data' => $leaveRequest->fresh()]);
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $user = auth()->user();
        $isOwner = $leaveRequest->user_id === $user->id;
        $isAdmin = in_array($user->role, ['admin', 'depot_manager']);

        if (!$isOwner && !$isAdmin) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }
        if (in_array($leaveRequest->status, ['cancelled', 'rejected'])) {
            return response()->json(['success' => false, 'message' => 'Cannot cancel this request'], 422);
        }

        $wasApproved = $leaveRequest->status === 'approved';
        $wasDeducted = (bool) $leaveRequest->balance_deducted_at;

        $leaveRequest->update([
            'status' => 'cancelled',
            'cancelled_by' => $user->id,
            'cancelled_at' => now(),
            'cancellation_reason' => $request->input('reason'),
        ]);

        if ($wasApproved && $wasDeducted && $leaveRequest->type === 'lrf' && $leaveRequest->employee_id && $leaveRequest->days > 0) {
            $balance = LeaveBalance::where('employee_id', $leaveRequest->employee_id)->first();
            if ($balance && in_array($leaveRequest->leave_type, ['annual', 'casual', 'sick', 'early'])) {
                $balance->restore($leaveRequest->leave_type, $leaveRequest->days);
            }
        }

        $typeLabel = $leaveRequest->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $msg = "{$leaveRequest->employee_name}'s {$typeLabel} ({$leaveRequest->tracking_no}) was cancelled by {$user->name}.";
        if (!$isOwner && $leaveRequest->user_id) {
            Notification::notifyUser($leaveRequest->user_id, 'lrf_cancelled', "{$typeLabel} Cancelled", $msg, ['leave_request_id' => $leaveRequest->id]);
        }
        if (!$isAdmin) {
            Notification::notifyRole('admin', 'lrf_cancelled', "{$typeLabel} Cancelled", $msg, ['leave_request_id' => $leaveRequest->id]);
            Notification::notifyRole('depot_manager', 'lrf_cancelled', "{$typeLabel} Cancelled", $msg, ['leave_request_id' => $leaveRequest->id]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Request cancelled' . ($wasDeducted ? ' and balance restored' : ''),
            'data' => $leaveRequest->fresh(['approver', 'canceller']),
        ]);
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
            ->where('status', 'approved')
            ->select('id', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days', 'department_label', 'approved_at', 'balance_deducted_at')
            ->orderBy('start_date')
            ->get();

        return response()->json(['success' => true, 'data' => $requests]);
    }

    public function notifications(): JsonResponse
    {
        $notifs = Notification::where('user_id', auth()->id())->orderByDesc('created_at')->limit(50)->get();
        return response()->json([
            'success' => true,
            'data' => $notifs,
            'unread_count' => $notifs->where('read', false)->count(),
        ]);
    }

    public function markAllRead(): JsonResponse
    {
        Notification::where('user_id', auth()->id())->where('read', false)->update(['read' => true]);
        return response()->json(['success' => true]);
    }

    public function markRead(int $id): JsonResponse
    {
        Notification::where('id', $id)->where('user_id', auth()->id())->update(['read' => true]);
        return response()->json(['success' => true]);
    }

    private function notifyNewRequest(LeaveRequest $leave, ?Employee $employee): void
    {
        $typeLabel = $leave->type === 'lrf' ? 'Leave Request' : 'Overtime Request';
        $hasDirectManager = false;

        if ($employee?->user_manager_id) {
            $hasDirectManager = true;
            Notification::notifyUser($employee->user_manager_id, 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. Awaiting your approval.", ['leave_request_id' => $leave->id]);
        } elseif ($employee?->direct_manager_id) {
            $managerEmp = Employee::find($employee->direct_manager_id);
            if ($managerEmp?->user_id) {
                $hasDirectManager = true;
                Notification::notifyUser($managerEmp->user_id, 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. Awaiting your approval.", ['leave_request_id' => $leave->id]);
            }
        }

        if (!$hasDirectManager) {
            Notification::notifyRole('depot_manager', 'new_' . $leave->type, "New {$typeLabel} - Direct Approval Required", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. No direct manager assigned. Awaiting your approval.", ['leave_request_id' => $leave->id]);
        }

        Notification::notifyRole('hr', 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}. HR review will be required after manager approval.", ['leave_request_id' => $leave->id]);
        Notification::notifyRole('admin', 'new_' . $leave->type, "New {$typeLabel}", "{$leave->employee_name} submitted a {$typeLabel} - {$leave->tracking_no}", ['leave_request_id' => $leave->id]);
    }

    private function notifyHr(LeaveRequest $leave, string $type, string $title, string $body): void
    {
        $data = ['leave_request_id' => $leave->id];
        Notification::notifyRole('hr', $type, $title, $body, $data);
        Notification::notifyRole('admin', $type, $title, $body, $data);
    }

    private function isDirectManager(LeaveRequest $leaveRequest, int $userId): bool
    {
        if (!$leaveRequest->employee_id) {
            return false;
        }

        $employee = Employee::find($leaveRequest->employee_id);
        if (!$employee) {
            return false;
        }

        if ($employee->user_manager_id && $employee->user_manager_id === $userId) {
            return true;
        }

        if ($employee->direct_manager_id) {
            $managerEmp = Employee::find($employee->direct_manager_id);
            return $managerEmp && $managerEmp->user_id === $userId;
        }

        return false;
    }

    private function generateTrackingNo(string $type, ?Employee $employee = null): string
    {
        $prefix = ($type === 'lrf' ? 'LRF' : 'OTR')
                . '-' . ($employee?->projectCode() ?? 'EG1')
                . '-';

        $next = LeaveRequest::where('tracking_no', 'like', $prefix . '%')
            ->where(function ($q) {
                $q->where('status', 'approved')
                  ->orWhereIn('status', ['pending', 'manager_approved', 'hr_approved']);
            })
            ->pluck('tracking_no')
            ->map(function ($tracking) use ($prefix) {
                $tail = substr((string) $tracking, strlen($prefix));
                return ctype_digit($tail) ? (int) $tail : 0;
            })
            ->max() + 1;

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function hasAvailableLeaveBalance(int $employeeId, string $type, float $days): bool
    {
        $balance = LeaveBalance::firstOrCreate(
            ['employee_id' => $employeeId],
            ['annual' => 21, 'casual' => 7, 'sick' => 90, 'early' => 0]
        );

        $reserved = LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('employee_id', $employeeId)
            ->whereNull('balance_deducted_at')
            ->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'approved'])
            ->whereIn('leave_type', ['annual', 'casual', 'sick', 'early'])
            ->where('days', '>', 0)
            ->where(function ($q) {
                $q->where('paid', true)->orWhereNull('paid');
            })
            ->selectRaw('leave_type, SUM(days) as days')
            ->groupBy('leave_type')
            ->pluck('days', 'leave_type');

        $annualLeft = $balance->getEffectiveRemaining('annual')
            - (float) ($reserved['annual'] ?? 0)
            - (float) ($reserved['casual'] ?? 0)
            - (float) ($reserved['early'] ?? 0);
        $casualLeft = $balance->getEffectiveRemaining('casual') - (float) ($reserved['casual'] ?? 0);
        $sickLeft   = $balance->getEffectiveRemaining('sick') - (float) ($reserved['sick'] ?? 0);

        return match ($type) {
            'annual', 'early' => $annualLeft >= $days,
            'casual' => $annualLeft >= $days && $casualLeft >= $days,
            'sick' => $sickLeft >= $days,
            default => true,
        };
    }
}
