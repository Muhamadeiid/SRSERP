<?php

namespace App\Services;

use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class LeaveDeductionService
{
    public function processDue(?int $employeeId = null): int
    {
        $query = LeaveRequest::query()
            ->where('type', 'lrf')
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->whereNull('balance_deducted_at')
            ->whereNotNull('employee_id')
            ->where('days', '>', 0)
            ->whereIn('leave_type', ['annual', 'casual', 'sick', 'early'])
            ->where(function ($q) {
                $q->where('paid', true)->orWhereNull('paid');
            })
            ->where(function ($q) {
                $q->where('company_paid', false)->orWhereNull('company_paid');
            })
            ->whereDate('end_date', '<', Carbon::today());

        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $processed = 0;

        $eligible = clone $query;
        // Deduct in the order the leaves ended (oldest first), so when an employee has
        // several due requests and not enough balance for all, the earliest leave is
        // the one that gets deducted. Ids are collected first because chunkById pages
        // by id and cannot keep an end_date order.
        $dueIds = (clone $query)->reorder()->orderBy('end_date')->orderBy('id')->pluck('id');

        foreach ($dueIds->chunk(100) as $ids) {
            foreach ($ids as $leaveRequestId) {
                $processed += DB::transaction(function () use ($leaveRequestId, $eligible) {
                    $leaveRequest = (clone $eligible)->whereKey($leaveRequestId)->lockForUpdate()->first();
                    if (!$leaveRequest) return 0;
                    // Serialize balance creation and different due requests for one employee.
                    \App\Models\Employee::withTrashed()->whereKey($leaveRequest->employee_id)->lockForUpdate()->firstOrFail();
                    $balance = LeaveBalance::firstOrCreate(
                        ['employee_id' => $leaveRequest->employee_id],
                        ['annual' => 21, 'casual' => 7, 'sick' => 90, 'early' => 0]
                    );
                    $balance = LeaveBalance::whereKey($balance->id)->lockForUpdate()->firstOrFail();

                    if ($balance->deduct($leaveRequest->leave_type, (float) $leaveRequest->days)) {
                        $leaveRequest->forceFill(['balance_deducted_at' => now()])->save();
                        return 1;
                    }
                    return 0;
                }, 3);
            }
        }

        return $processed;
    }
}
