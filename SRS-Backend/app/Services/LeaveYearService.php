<?php

namespace App\Services;

use App\Models\LeaveBalance;
use App\Models\SystemSetting;
use Carbon\Carbon;

class LeaveYearService
{
    public function currentCycleStart(?Carbon $today = null): Carbon
    {
        $today = ($today ?: Carbon::today())->copy()->startOfDay();
        $setting = SystemSetting::where('key', 'leave_year_start')->value('value') ?: '01-01';
        [$month, $day] = array_map('intval', explode('-', $setting));
        $month = min(12, max(1, $month));
        $day = min(Carbon::create($today->year, $month, 1)->daysInMonth, max(1, $day));
        $start = Carbon::create($today->year, $month, $day)->startOfDay();

        return $today->lt($start) ? $start->subYear() : $start;
    }

    public function refreshDue(?int $employeeId = null): int
    {
        $cycleStart = $this->currentCycleStart();
        $query = LeaveBalance::query();
        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $initialized = (clone $query)->whereNull('leave_cycle_started_on')->update([
            'leave_cycle_started_on' => $cycleStart->toDateString(),
        ]);

        $refreshed = 0;
        (clone $query)
            ->whereDate('leave_cycle_started_on', '<', $cycleStart)
            ->chunkById(100, function ($balances) use ($cycleStart, &$refreshed) {
                foreach ($balances as $balance) {
                    $balance->update([
                        'annual_remaining' => $balance->annual,
                        'casual_remaining' => $balance->casual,
                        'leave_cycle_started_on' => $cycleStart->toDateString(),
                    ]);
                    $refreshed++;
                }
            });

        return $initialized + $refreshed;
    }
}
