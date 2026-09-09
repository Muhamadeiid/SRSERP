<?php

namespace App\Services;

use App\Models\MaintenanceSchedule;
use App\Models\PublicHoliday;
use App\Models\Train;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;

class MaintenanceScheduleGenerator
{
    private const A_TARGET = 15;

    private const A_MIN = 13;

    private const A_MAX = 17;

    private const C_TARGET = 30;

    private const MAX_A_PER_DAY = 2;

    private const NINE_YEAR_WORKING_DAYS = 33;

    private const B_CYCLE = ['B1', 'B2', 'B3', 'G'];

    public function preview(int $year, int $month): array
    {
        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();
        $historyStart = $start->copy()->subYears(2);
        $history = MaintenanceSchedule::query()
            ->whereBetween('schedule_date', [$historyStart->toDateString(), $end->toDateString()])
            ->orderBy('schedule_date')
            ->get(['schedule_date', 'train_id', 'code']);
        $existing = $history->filter(fn ($row) => $row->schedule_date->betweenIncluded($start, $end));
        $past = $history->filter(fn ($row) => $row->schedule_date->lt($start));
        $holidays = $this->holidayDates($historyStart, $end->copy()->addMonths(2));
        $trains = Train::orderBy('display_order')->pluck('id')->all();
        $plan = [];
        $generatedMeta = [];
        $warnings = [];

        $blocked = $this->planNineYearWork($start, $end, $past, $trains, $holidays, $plan, $generatedMeta, $warnings);

        foreach ($trains as $trainIndex => $trainId) {
            if ($trainId === '04') {
                $date = $this->nearestAvailable($start->copy()->day(min(7, $start->daysInMonth)), $start, $end, $trainId, $plan, $blocked, $holidays);
                if ($date) {
                    $this->put($plan, $date, $trainId, 'A+C');
                }

                continue;
            }

            $trainPast = $past->where('train_id', $trainId);
            $this->planBCycle($trainId, $trainIndex, $trainPast, $start, $end, $plan, $blocked, $holidays, $warnings);

            $lastC = $this->lastDateFor($trainPast, ['C', 'A+C', '9Y+C']);
            if ($lastC) {
                foreach ($this->dueDates($lastC, self::C_TARGET, $start, $end, $holidays) as $due) {
                    $date = $this->nearestAvailable($due, $start, $end, $trainId, $plan, $blocked, $holidays);
                    if ($date) {
                        $this->put($plan, $date, $trainId, 'C');
                    }
                }
            } else {
                $warnings[] = "Train {$trainId}: no previous C visit was found; C was not generated.";
            }
        }

        $this->planAVisits($trains, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->ensureDailyCoverage($past, $start, $end, $plan, $blocked, $holidays, $warnings);

        ksort($plan);

        return [
            'entries' => collect($plan)->map(fn ($rows) => collect($rows)->sortKeys()->all())->all(),
            'meta' => $generatedMeta,
            'warnings' => array_values(array_unique($warnings)),
            'replaces_existing' => $existing->isNotEmpty(),
            'existing_count' => $existing->count(),
            'rules' => ['a_target' => 15, 'a_min' => 13, 'a_max' => 17, 'max_a_per_day' => 2],
        ];
    }

    private function planAVisits(array $trains, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $candidates = [];
        foreach ($trains as $trainId) {
            if ($trainId === '04') {
                continue;
            }
            $lastA = $this->lastDateFor($past->where('train_id', $trainId), ['A', 'A+C']);
            if (! $lastA) {
                $warnings[] = "Train {$trainId}: no previous A visit was found; A was not generated.";

                continue;
            }
            foreach ($this->dueDates($lastA, self::A_TARGET, $start, $end, $holidays) as $due) {
                $candidates[] = [$due, $trainId];
            }
        }
        usort($candidates, fn ($a, $b) => $a[0]->timestamp <=> $b[0]->timestamp ?: strcmp($a[1], $b[1]));
        foreach ($candidates as [$due, $trainId]) {
            $date = $this->balancedADate($due, $start, $end, $trainId, $plan, $blocked, $holidays);
            if ($date) {
                $this->put($plan, $date, $trainId, 'A');
            } else {
                $warnings[] = "Train {$trainId}: no free A slot within the 13-17 day balance window.";
            }
        }
    }

    private function planBCycle(string $trainId, int $trainIndex, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $last = $past->filter(fn ($row) => in_array($this->baseCode($row->code), self::B_CYCLE, true))->last();
        if (! $last) {
            $this->planFallbackBCycle($trainId, $trainIndex, $start, $end, $plan, $blocked, $holidays);
            $warnings[] = "Train {$trainId}: no B-cycle history was found; a fleet-rotation B baseline was used.";

            return;
        }
        $lastCode = $this->baseCode($last->code);
        $nextCode = self::B_CYCLE[(array_search($lastCode, self::B_CYCLE, true) + 1) % count(self::B_CYCLE)];
        $due = $last->schedule_date->copy()->addMonthsNoOverflow(3);
        if (! $due->betweenIncluded($start, $end)) {
            return;
        }
        $first = $this->nearestAvailable($due, $start, $end, $trainId, $plan, $blocked, $holidays, true);
        if (! $first) {
            return;
        }
        $this->put($plan, $first, $trainId, $nextCode);
        if ($nextCode === 'G') {
            $second = $first->copy()->addDay();
            while ($second->lte($end) && ! $this->isWorkingDay($second, $holidays)) {
                $second->addDay();
            }
            if ($second->lte($end) && empty($plan[$second->toDateString()][$trainId])) {
                $this->put($plan, $second, $trainId, 'G');
            }
        }
    }

    private function planFallbackBCycle(string $trainId, int $trainIndex, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays): void
    {
        $absoluteMonth = ($start->year * 12) + $start->month;
        if (($absoluteMonth + $trainIndex) % 3 !== 0) {
            return;
        }

        $code = self::B_CYCLE[(int) (floor($absoluteMonth / 3) + $trainIndex) % count(self::B_CYCLE)];
        $preferredDay = 3 + (($trainIndex * 4) % max(1, min(23, $start->daysInMonth - 2)));
        $date = $this->nearestAvailable($start->copy()->day($preferredDay), $start, $end, $trainId, $plan, $blocked, $holidays, true);
        if (! $date) {
            return;
        }

        $this->put($plan, $date, $trainId, $code);
        if ($code !== 'G') {
            return;
        }

        $second = $date->copy()->addDay();
        while ($second->lte($end) && ! $this->isWorkingDay($second, $holidays)) {
            $second->addDay();
        }
        if ($second->lte($end) && empty($plan[$second->toDateString()][$trainId])) {
            $this->put($plan, $second, $trainId, 'G');
        }
    }

    private function planNineYearWork(Carbon $start, Carbon $end, Collection $past, array $trains, array $holidays, array &$plan, array &$generatedMeta, array &$warnings): array
    {
        $blocked = [];
        $latest = $past->where('code', '9Y')->sortBy('schedule_date')->last();
        if (! $latest || $latest->schedule_date->lt($start->copy()->subDays(60))) {
            return $blocked;
        }

        $trainId = $latest->train_id;
        $allDates = $past->where('train_id', $trainId)->where('code', '9Y')->pluck('schedule_date')->sort()->values();
        $blockStart = $allDates->last();
        for ($i = $allDates->count() - 2; $i >= 0; $i--) {
            if ($allDates[$i]->diffInDays($blockStart) > 60) {
                break;
            }
            $blockStart = $allDates[$i];
        }
        $workingDone = collect(CarbonPeriod::create($blockStart, $latest->schedule_date))
            ->filter(fn ($date) => $this->isWorkingDay($date, $holidays))->count();
        $cursor = $latest->schedule_date->copy()->addDay();
        $remaining = max(0, self::NINE_YEAR_WORKING_DAYS - $workingDone);
        if ($remaining === 0) {
            $trainId = $this->nextTrain($trainId, $trains);
            $remaining = self::NINE_YEAR_WORKING_DAYS;
        }

        while ($cursor->lte($end)) {
            $this->put($plan, $cursor, $trainId, '9Y');
            $blocked[$trainId][$cursor->toDateString()] = true;
            if ($this->isWorkingDay($cursor, $holidays)) {
                $remaining--;
            }
            if ($remaining === 0) {
                $generatedMeta[$cursor->toDateString()] = ['remark' => sprintf('TS %02d Night Test', (int) $trainId)];
                $trainId = $this->nextTrain($trainId, $trains);
                $remaining = self::NINE_YEAR_WORKING_DAYS;
            }
            $cursor->addDay();
        }
        $warnings[] = "Train {$trainId}: 9Y continues after {$end->format('M Y')} ({$remaining} working days remaining).";

        return $blocked;
    }

    private function nextTrain(string $trainId, array $trains): string
    {
        $index = array_search($trainId, $trains, true);

        return $trains[((int) $index + 1) % count($trains)];
    }

    private function dueDates(Carbon $last, int $interval, Carbon $start, Carbon $end, array $holidays): array
    {
        $dates = [];
        $cursor = $last->copy();
        while (true) {
            $cursor->addDays($interval);
            while (! $this->isWorkingDay($cursor, $holidays)) {
                $cursor->addDay();
            }
            if ($cursor->gt($end)) {
                break;
            }
            if ($cursor->gte($start)) {
                $dates[] = $cursor->copy();
            }
        }

        return $dates;
    }

    private function balancedADate(Carbon $due, Carbon $start, Carbon $end, string $trainId, array $plan, array $blocked, array $holidays): ?Carbon
    {
        foreach ([0, -1, 1, -2, 2] as $offset) {
            $candidate = $due->copy()->addDays($offset);
            if (! $candidate->betweenIncluded($start, $end) || ! $this->isWorkingDay($candidate, $holidays)) {
                continue;
            }
            if (! empty($blocked[$trainId][$candidate->toDateString()]) || ! empty($plan[$candidate->toDateString()][$trainId])) {
                continue;
            }
            $aCount = collect($plan[$candidate->toDateString()] ?? [])->filter(fn ($code) => $code === 'A')->count();
            if ($aCount < self::MAX_A_PER_DAY) {
                return $candidate;
            }
        }

        return null;
    }

    private function ensureDailyCoverage(Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        foreach (CarbonPeriod::create($start, $end) as $emptyDate) {
            $emptyKey = $emptyDate->toDateString();
            if (! $this->isWorkingDay($emptyDate, $holidays) || ! empty($plan[$emptyKey])) {
                continue;
            }

            $moved = false;
            foreach ([1, -1, 2, -2, 3, -3] as $offset) {
                $source = $emptyDate->copy()->addDays($offset);
                if (! $source->betweenIncluded($start, $end)) {
                    continue;
                }
                $sourceKey = $source->toDateString();
                if (count($plan[$sourceKey] ?? []) < 2) {
                    continue;
                }
                $aTrains = collect($plan[$sourceKey] ?? [])->filter(fn ($code) => $code === 'A')->keys();
                foreach ($aTrains as $trainId) {
                    if (! empty($blocked[$trainId][$emptyKey]) || ! $this->aMoveKeepsBalance($trainId, $source, $emptyDate, $past, $plan)) {
                        continue;
                    }
                    unset($plan[$sourceKey][$trainId]);
                    if (empty($plan[$sourceKey])) {
                        unset($plan[$sourceKey]);
                    }
                    $this->put($plan, $emptyDate, $trainId, 'A');
                    $moved = true;
                    break 2;
                }
            }
            if (! $moved) {
                $warnings[] = "{$emptyKey}: no maintenance visit could be moved here without breaking the A balance.";
            }
        }
    }

    private function aMoveKeepsBalance(string $trainId, Carbon $source, Carbon $target, Collection $past, array $plan): bool
    {
        $dates = $past->where('train_id', $trainId)
            ->filter(fn ($row) => in_array('A', array_map('trim', explode('+', strtoupper((string) $row->code))), true))
            ->pluck('schedule_date')
            ->map(fn ($date) => $date->copy());

        foreach ($plan as $date => $entries) {
            if (($entries[$trainId] ?? null) === 'A' && $date !== $source->toDateString()) {
                $dates->push(Carbon::parse($date));
            }
        }
        $dates->push($target->copy());
        $ordered = $dates->sort()->values();
        $index = $ordered->search(fn ($date) => $date->isSameDay($target));
        if ($index === false) {
            return false;
        }
        if ($index > 0) {
            $previousGap = $ordered[$index - 1]->diffInDays($target);
            if ($previousGap < self::A_MIN || $previousGap > self::A_MAX) {
                return false;
            }
        }
        if ($index < $ordered->count() - 1) {
            $nextGap = $target->diffInDays($ordered[$index + 1]);
            if ($nextGap < self::A_MIN || $nextGap > self::A_MAX) {
                return false;
            }
        }

        return true;
    }

    private function nearestAvailable(Carbon $due, Carbon $start, Carbon $end, string $trainId, array $plan, array $blocked, array $holidays, bool $forwardOnly = false): ?Carbon
    {
        $offsets = $forwardOnly ? range(0, 7) : [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
        foreach ($offsets as $offset) {
            $candidate = $due->copy()->addDays($offset);
            if (! $candidate->betweenIncluded($start, $end) || ! $this->isWorkingDay($candidate, $holidays)) {
                continue;
            }
            if (empty($blocked[$trainId][$candidate->toDateString()]) && empty($plan[$candidate->toDateString()][$trainId])) {
                return $candidate;
            }
        }

        return null;
    }

    private function lastDateFor(Collection $entries, array $codes): ?Carbon
    {
        $entry = $entries
            ->filter(function ($row) use ($codes) {
                $parts = array_map('trim', explode('+', strtoupper((string) $row->code)));

                return collect($codes)->contains(fn ($code) => in_array($code, $parts, true));
            })
            ->sortBy('schedule_date')
            ->last();

        return $entry?->schedule_date?->copy();
    }

    private function holidayDates(Carbon $start, Carbon $end): array
    {
        $dates = [];
        PublicHoliday::query()->whereDate('date', '<=', $end)->where(function ($query) use ($start) {
            $query->whereDate('end_date', '>=', $start)->orWhere(fn ($single) => $single->whereNull('end_date')->whereDate('date', '>=', $start));
        })->get(['date', 'end_date'])->each(function ($holiday) use (&$dates) {
            foreach (CarbonPeriod::create($holiday->date, $holiday->end_date ?? $holiday->date) as $date) {
                $dates[$date->toDateString()] = true;
            }
        });

        return $dates;
    }

    private function isWorkingDay(Carbon $date, array $holidays): bool
    {
        return ! $date->isFriday() && empty($holidays[$date->toDateString()]);
    }

    private function baseCode(string $code): string
    {
        foreach (self::B_CYCLE as $candidate) {
            if (str_contains(strtoupper($code), $candidate)) {
                return $candidate;
            }
        }

        return strtoupper($code);
    }

    private function put(array &$plan, Carbon $date, string $trainId, string $code): void
    {
        $plan[$date->toDateString()][$trainId] = $code;
    }
}
