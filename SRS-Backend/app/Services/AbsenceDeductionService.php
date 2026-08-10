<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PublicHoliday;
use Carbon\Carbon;

class AbsenceDeductionService
{
    private const DEDUCTION_HOURS = [10, 12, 16, 24];

    /**
     * Build the absence sequence inside the selected payroll period only.
     * An HR override on a daily attendance entry always wins over the automatic amount.
     */
    public function forEmployee(Employee $employee, string $periodStart, string $periodEnd): array
    {
        $end = Carbon::parse($periodEnd)->min(Carbon::today());
        $start = Carbon::parse($periodStart)->startOfDay();
        if ($employee->hiring_date) {
            $start = $start->max($employee->hiring_date->copy()->startOfDay());
        }
        if ($start->gt($end)) {
            return [];
        }

        $attendance = Attendance::where('employee_id', $employee->id)
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get()
            ->keyBy(fn (Attendance $record) => $record->date->toDateString());

        $leaveDates = [];
        LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('employee_id', $employee->id)
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->whereIn('leave_type', ['annual', 'casual', 'sick'])
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start)
            ->get(['start_date', 'end_date'])
            ->each(function (LeaveRequest $leave) use (&$leaveDates) {
                $cursor = Carbon::parse($leave->start_date);
                $last = Carbon::parse($leave->end_date ?? $leave->start_date);
                while ($cursor->lte($last)) {
                    $leaveDates[$cursor->toDateString()] = true;
                    $cursor->addDay();
                }
            });

        $holidayDates = [];
        PublicHoliday::query()
            ->whereDate('date', '<=', $end)
            ->where(function ($query) use ($start) {
                $query->whereDate('end_date', '>=', $start)
                    ->orWhere(function ($singleDay) use ($start) {
                        $singleDay->whereNull('end_date')->whereDate('date', '>=', $start);
                    });
            })
            ->get(['date', 'end_date'])
            ->each(function (PublicHoliday $holiday) use (&$holidayDates) {
                $cursor = $holiday->date->copy();
                $last = ($holiday->end_date ?? $holiday->date)->copy();
                while ($cursor->lte($last)) {
                    $holidayDates[$cursor->toDateString()] = true;
                    $cursor->addDay();
                }
            });

        $result = [];
        $occurrence = 0;
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $date = $cursor->toDateString();
            $record = $attendance->get($date);
            $isExcluded = !$employee->isWorkingDay($cursor)
                || isset($holidayDates[$date])
                || isset($leaveDates[$date]);
            $isAbsent = !$isExcluded && (!$record || $record->status === 'absent');

            if ($isAbsent) {
                $occurrence++;
                if ($date >= $periodStart && $date <= $periodEnd) {
                    $default = self::DEDUCTION_HOURS[min($occurrence, count(self::DEDUCTION_HOURS)) - 1];
                    $override = $record?->absence_deduction_override_hours;
                    $result[$date] = [
                        'occurrence' => $occurrence,
                        'default_hours' => $default,
                        'deduction_hours' => $override === null ? $default : (float) $override,
                        'is_overridden' => $override !== null,
                        'reason' => $record?->absence_deduction_override_reason,
                    ];
                }
            }
            $cursor->addDay();
        }

        return $result;
    }
}
