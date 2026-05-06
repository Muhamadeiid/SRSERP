<?php

namespace App\Services;

use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use Carbon\Carbon;

class LeaveDeductionService
{
    public function processDue(?int $employeeId = null): int
    {
        $query = LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('status', 'approved')
            ->whereNull('balance_deducted_at')
            ->whereNotNull('employee_id')
            ->where('days', '>', 0)
            ->whereIn('leave_type', ['annual', 'casual', 'sick', 'early'])
            ->whereDate('end_date', '<', Carbon::today());

        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $processed = 0;

        $query->orderBy('end_date')->chunkById(100, function ($requests) use (&$processed) {
            foreach ($requests as $leaveRequest) {
                $balance = LeaveBalance::firstOrCreate(
                    ['employee_id' => $leaveRequest->employee_id],
                    ['annual' => 14, 'casual' => 7, 'sick' => 90, 'early' => 0]
                );

                if ($balance->deduct($leaveRequest->leave_type, (int) $leaveRequest->days)) {
                    $leaveRequest->forceFill(['balance_deducted_at' => now()])->save();
                    $processed++;
                }
            }
        });

        return $processed;
    }
}
