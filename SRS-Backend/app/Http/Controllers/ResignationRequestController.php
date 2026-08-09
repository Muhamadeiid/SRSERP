<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\ResignationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResignationRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ensureHrAccess($request);

        $requests = ResignationRequest::with([
            'employee:id,name,status,resignation_date,last_working_date',
            'creator:id,name,role', 'approver:id,name,role', 'rejecter:id,name,role',
        ])->latest()->get();

        return response()->json(['success' => true, 'data' => $requests]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['hr', 'admin'], true)) {
            return response()->json(['success' => false, 'message' => 'Only HR can create resignation requests.'], 403);
        }

        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'tracking_no' => 'nullable|string|max:64',
            'full_name' => 'required|string|max:255',
            'department' => 'nullable|string|max:100',
            'department_label' => 'nullable|string|max:100',
            'current_title' => 'required|string|max:255',
            'current_title_ar' => 'nullable|string|max:255',
            'resignation_date' => 'required|date',
            'last_working_date' => 'required|date|after_or_equal:resignation_date',
            'direct_manager_name' => 'nullable|string|max:255',
            'depot_manager_name' => 'nullable|string|max:255',
            'declaration_name' => 'nullable|string|max:255',
            'national_id' => 'nullable|string|max:30',
            'declaration_date' => 'nullable|date',
        ]);

        $employee = Employee::active()->find($data['employee_id']);
        if (! $employee) {
            return response()->json(['success' => false, 'message' => 'This employee is not in the active workforce.'], 422);
        }

        $alreadyOpen = ResignationRequest::where('employee_id', $employee->id)
            ->whereIn('status', ['pending', 'approved'])
            ->exists();
        if ($alreadyOpen) {
            return response()->json(['success' => false, 'message' => 'This employee already has an active resignation request.'], 422);
        }

        $resignation = ResignationRequest::create($data + [
            'created_by' => $user->id,
            'status' => 'pending',
        ]);

        Notification::notifyRole(
            'depot_manager',
            'resignation_approval_required',
            'IMPORTANT: Resignation Approval Required',
            "HR {$user->name} submitted a resignation request for {$resignation->full_name}. Last working day: {$resignation->last_working_date->format('d M Y')}.",
            ['resignation_request_id' => $resignation->id, 'path' => '/human-resources/resignations'],
            true
        );
        Notification::notifyRole(
            'admin',
            'resignation_approval_required',
            'IMPORTANT: Resignation Approval Required',
            "A resignation request for {$resignation->full_name} is awaiting Depot Manager approval.",
            ['resignation_request_id' => $resignation->id, 'path' => '/human-resources/resignations']
        );

        return response()->json(['success' => true, 'data' => $resignation->load('creator:id,name,role')], 201);
    }

    public function approve(Request $request, ResignationRequest $resignationRequest): JsonResponse
    {
        $this->ensureDepotAccess($request);
        if ($resignationRequest->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'This request is no longer pending.'], 422);
        }

        DB::transaction(function () use ($request, $resignationRequest) {
            $locked = ResignationRequest::lockForUpdate()->findOrFail($resignationRequest->id);
            $employee = Employee::withTrashed()->lockForUpdate()->findOrFail($locked->employee_id);

            $locked->update([
                'status' => 'approved',
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
            ]);
            $employee->update([
                'resignation_date' => $locked->resignation_date,
                'last_working_date' => $locked->last_working_date,
            ]);
        });

        $body = "{$resignationRequest->full_name}'s resignation was approved. The employee remains active through {$resignationRequest->last_working_date->format('d M Y')} and then moves to Ex-Employees automatically.";
        Notification::notifyRole('hr', 'resignation_approved', 'Resignation Approved', $body, ['resignation_request_id' => $resignationRequest->id, 'path' => '/human-resources/resignations'], true);
        Notification::notifyRole('admin', 'resignation_approved', 'Resignation Approved', $body, ['resignation_request_id' => $resignationRequest->id, 'path' => '/human-resources/resignations']);

        return response()->json(['success' => true, 'data' => $resignationRequest->fresh(['employee', 'creator', 'approver'])]);
    }

    public function reject(Request $request, ResignationRequest $resignationRequest): JsonResponse
    {
        $this->ensureDepotAccess($request);
        if ($resignationRequest->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'This request is no longer pending.'], 422);
        }

        $data = $request->validate(['reason' => 'required|string|max:1000']);
        $resignationRequest->update([
            'status' => 'rejected',
            'rejected_by' => $request->user()->id,
            'rejected_at' => now(),
            'rejection_reason' => $data['reason'],
        ]);

        $body = "{$resignationRequest->full_name}'s resignation was rejected. Reason: {$data['reason']}";
        Notification::notifyRole('hr', 'resignation_rejected', 'Resignation Rejected', $body, ['resignation_request_id' => $resignationRequest->id, 'path' => '/human-resources/resignations'], true);
        Notification::notifyRole('admin', 'resignation_rejected', 'Resignation Rejected', $body, ['resignation_request_id' => $resignationRequest->id, 'path' => '/human-resources/resignations']);

        return response()->json(['success' => true, 'data' => $resignationRequest->fresh(['creator', 'rejecter'])]);
    }

    private function ensureHrAccess(Request $request): void
    {
        abort_unless($request->user() && in_array($request->user()->role, ['hr', 'depot_manager', 'admin'], true), 403);
    }

    private function ensureDepotAccess(Request $request): void
    {
        abort_unless($request->user() && in_array($request->user()->role, ['depot_manager', 'admin'], true), 403);
    }
}
