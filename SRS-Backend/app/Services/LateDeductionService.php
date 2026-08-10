<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PublicHoliday;
use Carbon\Carbon;

class LateDeductionService
{
    /** Penalty hours from the approved company schedule, reset every payroll period. */
    private const NO_DISRUPTION = [
        'up_to_15' => [0, 4, 8, 24],
        '16_to_60' => [4, 8, 16, 24],
    ];

    private const WITH_DISRUPTION = [
        'up_to_15' => [4, 8, 16, 32],
        '16_to_60' => [8, 16, 24, 32],
    ];

    /**
     * Calculate late penalties within one selected payroll period.
     * More than 60 minutes is handled by AbsenceDeductionService as an absence.
     */
    public function forEmployee(Employee $employee, string $periodStart, string $periodEnd): array
    {
        $start = Carbon::parse($periodStart)->startOfDay();
        $end = Carbon::parse($periodEnd)->min(Carbon::today());
        if ($employee->hiring_date) {
            $start = $start->max($employee->hiring_date->copy()->startOfDay());
        }
        if ($start->gt($end)) return [];

        $holidays = $this->holidayDates($start, $end);
        $leaveDates = $this->leaveDates($employee, $start, $end);
        $graceRemaining = AttendancePolicy::int('attendance_late_grace_minutes');
        $occurrences = ['up_to_15' => 0, '16_to_60' => 0];
        $result = [];

        Attendance::where('employee_id', $employee->id)
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->orderBy('date')
            ->get()
            ->each(function (Attendance $record) use (&$result, &$graceRemaining, &$occurrences, $employee, $holidays, $leaveDates) {
                $date = $record->date->toDateString();
                $lateMinutes = (int) $record->late_minutes;
                if ($lateMinutes <= 0 || !$employee->isWorkingDay($record->date) || isset($holidays[$date]) || isset($leaveDates[$date])) return;

                // A delay over an hour follows the absence policy, not the late table.
                if ($lateMinutes > 60) return;

                $chargeableMinutes = max(0, $lateMinutes - $graceRemaining);
                $graceRemaining = max(0, $graceRemaining - $lateMinutes);
                if ($chargeableMinutes === 0) return;

                $band = $chargeableMinutes <= 15 ? 'up_to_15' : '16_to_60';
                $occurrences[$band]++;
                $schedule = $record->late_caused_disruption ? self::WITH_DISRUPTION : self::NO_DISRUPTION;
                $default = $schedule[$band][min($occurrences[$band], 4) - 1];
                $override = $record->late_penalty_override_hours;

                $result[$date] = [
                    'occurrence' => $occurrences[$band],
                    'band' => $band,
                    'default_hours' => $default,
                    'deduction_hours' => $override === null ? $default : (float) $override,
                    'is_overridden' => $override !== null,
                    'caused_disruption' => (bool) $record->late_caused_disruption,
                    'reason' => $record->late_penalty_override_reason,
                ];
            });

        return $result;
    }

    private function holidayDates(Carbon $start, Carbon $end): array
    {
        $dates = [];
        PublicHoliday::query()
            ->whereDate('date', '<=', $end)
            ->where(function ($query) use ($start) {
                $query->whereDate('end_date', '>=', $start)
                    ->orWhere(function ($singleDay) use ($start) {
                        $singleDay->whereNull('end_date')->whereDate('date', '>=', $start);
                    });
            })
            ->get(['date', 'end_date'])
            ->each(function (PublicHoliday $holiday) use (&$dates) {
                $cursor = $holiday->date->copy();
                $last = ($holiday->end_date ?? $holiday->date)->copy();
                while ($cursor->lte($last)) {
                    $dates[$cursor->toDateString()] = true;
                    $cursor->addDay();
                }
            });

        return $dates;
    }

    private function leaveDates(Employee $employee, Carbon $start, Carbon $end): array
    {
        $dates = [];
        LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('employee_id', $employee->id)
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->whereIn('leave_type', ['annual', 'casual', 'sick'])
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start)
            ->get(['start_date', 'end_date'])
            ->each(function (LeaveRequest $leave) use (&$dates) {
                $cursor = Carbon::parse($leave->start_date);
                $last = Carbon::parse($leave->end_date ?? $leave->start_date);
                while ($cursor->lte($last)) {
                    $dates[$cursor->toDateString()] = true;
                    $cursor->addDay();
                }
            });

        return $dates;
    }
}
