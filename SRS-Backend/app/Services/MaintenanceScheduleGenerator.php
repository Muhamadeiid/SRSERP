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
    private const VISIT_TARGET = 15;

    private const A_MIN = 13;

    private const A_MAX = 17;

    private const MAX_VISITS_PER_DAY = 2;

    private const MAX_A_PER_DAY = 2;

    private const C_MIN_ROUTINE_GAP = 5;

    private const NINE_YEAR_WORKING_DAYS = 33;

    private const B_CYCLE = ['B1', 'B2', 'B3', 'G'];

    private const VERIFIED_BASELINE_END = '2026-09-30';

    private const B_HISTORY_BASELINE = [
        '01' => ['2026-07-02', 'B1'],
        '02' => ['2026-06-29', 'B3'],
        '12' => ['2026-08-12', 'G'],
        '04' => ['2026-09-29', 'G'],
        '13' => ['2026-08-23', 'B3'],
        '03' => ['2026-09-30', 'B3'],
        '14' => ['2026-08-08', 'B2'],
        '07' => ['2026-07-09', 'B1'],
        '05' => ['2026-09-17', 'B2'],
        '06' => ['2026-08-13', 'B1'],
        '15' => ['2026-01-26', 'B1'],
        '09' => ['2026-04-18', 'B3'],
        '10' => ['2026-04-21', 'B3'],
        '16' => ['2026-02-22', 'B3'],
        '08' => ['2026-07-07', 'B3'],
        '11' => ['2026-05-21', 'B3'],
        '17' => ['2026-08-26', 'B1'],
        '18' => ['2026-05-25', 'B2'],
        '19' => ['2026-09-19', 'B3'],
        '20' => ['2026-08-02', 'B2'],
    ];

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

        $this->planRoutineVisits($trains, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->ensureDailyCoverage($past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->planMonthlyCVisits($trains, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->assignTracks($plan, $generatedMeta);

        ksort($plan);

        return [
            'entries' => collect($plan)->map(fn ($rows) => collect($rows)->sortKeys()->all())->all(),
            'meta' => $generatedMeta,
            'warnings' => array_values(array_unique($warnings)),
            'replaces_existing' => $existing->isNotEmpty(),
            'existing_count' => $existing->count(),
            'rules' => ['visit_target' => 15, 'visit_min' => 13, 'visit_max' => 17, 'max_routine_visits_per_day' => 2, 'max_c_per_day' => 1, 'c_min_routine_gap' => 5],
        ];
    }

    private function planRoutineVisits(array $trains, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        usort($trains, function ($leftTrain, $rightTrain) use ($past, $start) {
            $leftDue = $this->nextBDueForTrain($leftTrain, $past, $start);
            $rightDue = $this->nextBDueForTrain($rightTrain, $past, $start);
            $leftRoutineDue = $this->nextRoutineDueForTrain($leftTrain, $past);
            $rightRoutineDue = $this->nextRoutineDueForTrain($rightTrain, $past);

            return ($leftRoutineDue?->timestamp ?? PHP_INT_MAX) <=> ($rightRoutineDue?->timestamp ?? PHP_INT_MAX)
                ?: ($leftDue?->timestamp ?? PHP_INT_MAX) <=> ($rightDue?->timestamp ?? PHP_INT_MAX)
                ?: strcmp((string) $leftTrain, (string) $rightTrain);
        });

        foreach ($trains as $trainId) {
            $trainPast = $past->where('train_id', $trainId)->sortBy('schedule_date')->values();
            $routinePast = $trainPast->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')->values();
            $lastVisit = $routinePast->last()?->schedule_date?->copy();
            $scheduleEnd = $end->copy();
            $plannedOverhaul = $this->plannedOverhaulWindow($trainId, $plan);
            $lastOverhaul = $this->latestOverhaulDate($trainId, $trainPast, $plan);
            $resumingAfterOverhaul = false;
            $enteringOverhaul = false;

            if ($plannedOverhaul && $plannedOverhaul['start']->gt($start)) {
                $scheduleEnd = $plannedOverhaul['start']->copy()->subDay();
                $lastOverhaul = null;
                $enteringOverhaul = true;
            } elseif ($lastOverhaul && (! $lastVisit || $lastOverhaul->gt($lastVisit))) {
                $resumingAfterOverhaul = true;
            }
            if ($resumingAfterOverhaul) {
                $lastVisit = $lastOverhaul->copy();
            }
            if (! $lastVisit) {
                $warnings[] = "Train {$trainId}: no visit history was found; no schedule was invented.";

                continue;
            }

            $lastB = $this->lastBReference($trainId, $routinePast, $start);
            $lastBCode = $lastB['code'] ?? null;
            $nextBDue = isset($lastB['date']) ? $lastB['date']->copy()->addMonthsNoOverflow(3) : null;
            while ($lastVisit->copy()->addDays(self::A_MIN)->lte($scheduleEnd)) {
                $target = $lastVisit->copy()->addDays(self::VISIT_TARGET);
                $code = ($resumingAfterOverhaul || $enteringOverhaul) ? 'A' : $this->nextVisitCode($target, $lastBCode, $nextBDue);
                $date = $this->balancedVisitDate($lastVisit, $start, $scheduleEnd, $trainId, $code, $plan, $blocked, $holidays);
                if (! $date) {
                    if ($lastVisit->copy()->addDays(self::A_MAX)->gte($start)) {
                        $warnings[] = "Train {$trainId}: no slot keeps the visit gap between 13 and 17 days.";
                    }
                    break;
                }

                $this->put($plan, $date, $trainId, $code);
                if ($code === 'G') {
                    $this->planSecondGDay($date, $scheduleEnd, $trainId, $plan, $blocked, $holidays, $warnings);
                }
                $lastVisit = $date->copy();
                $resumingAfterOverhaul = false;
                if (in_array($code, self::B_CYCLE, true)) {
                    $lastBCode = $code;
                    $nextBDue = $date->copy()->addMonthsNoOverflow(3);
                }
            }

            if (! $lastB) {
                $warnings[] = "Train {$trainId}: no B/G history was found; no B/G schedule was invented.";
            }
        }
    }

    private function plannedOverhaulWindow(string $trainId, array $plan): ?array
    {
        $dates = collect($plan)
            ->filter(fn ($entries) => isset($entries[$trainId]) && $this->isNineYearCode($entries[$trainId]))
            ->keys()
            ->map(fn ($date) => Carbon::parse($date))
            ->sort()
            ->values();

        return $dates->isEmpty() ? null : ['start' => $dates->first()->copy(), 'end' => $dates->last()->copy()];
    }

    private function latestOverhaulDate(string $trainId, Collection $history, array $plan): ?Carbon
    {
        $dates = $history
            ->filter(fn ($row) => $this->isNineYearCode($row->code))
            ->pluck('schedule_date')
            ->map(fn ($date) => $date->copy());

        foreach ($plan as $date => $entries) {
            if (isset($entries[$trainId]) && $this->isNineYearCode($entries[$trainId])) {
                $dates->push(Carbon::parse($date));
            }
        }

        return $dates->sort()->last()?->copy();
    }

    private function nextBDueForTrain(string $trainId, Collection $past, Carbon $start): ?Carbon
    {
        $history = $past->where('train_id', $trainId)->sortBy('schedule_date')->values();
        $reference = $this->lastBReference($trainId, $history, $start);

        return isset($reference['date']) ? $reference['date']->copy()->addMonthsNoOverflow(3) : null;
    }

    private function nextRoutineDueForTrain(string $trainId, Collection $past): ?Carbon
    {
        $last = $past->where('train_id', $trainId)
            ->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')
            ->sortBy('schedule_date')
            ->last();

        return $last?->schedule_date?->copy()->addDays(self::VISIT_TARGET);
    }

    private function nextVisitCode(Carbon $target, ?string $lastBCode, ?Carbon $nextBDue): string
    {
        if ($lastBCode && $nextBDue && abs($target->diffInDays($nextBDue, false)) <= 8) {
            $index = array_search($lastBCode, self::B_CYCLE, true);

            return self::B_CYCLE[((int) $index + 1) % count(self::B_CYCLE)];
        }

        return 'A';
    }

    private function lastBReference(string $trainId, Collection $history, Carbon $start): ?array
    {
        $databaseEntry = $history
            ->filter(fn ($row) => in_array($this->baseCode($row->code), self::B_CYCLE, true))
            ->last();
        $reference = $databaseEntry ? [
            'date' => $databaseEntry->schedule_date->copy(),
            'code' => $this->baseCode($databaseEntry->code),
        ] : null;

        $baseline = self::B_HISTORY_BASELINE[$trainId] ?? null;
        if ($baseline) {
            $baselineDate = Carbon::parse($baseline[0]);
            $databaseIsAfterVerifiedBaseline = $reference
                && $reference['date']->gt(Carbon::parse(self::VERIFIED_BASELINE_END));
            if ($baselineDate->lt($start) && ! $databaseIsAfterVerifiedBaseline) {
                $reference = ['date' => $baselineDate, 'code' => $baseline[1]];
            }
        }

        return $reference;
    }

    private function planSecondGDay(Carbon $first, Carbon $end, string $trainId, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $second = $first->copy()->addDay();
        while ($second->lte($end) && ! $this->isWorkingDay($second, $holidays)) {
            $second->addDay();
        }
        if ($second->gt($end) || ! empty($blocked[$trainId][$second->toDateString()]) || ! empty($plan[$second->toDateString()][$trainId])) {
            $warnings[] = "Train {$trainId}: the second G day falls outside the available schedule.";

            return;
        }
        if ($this->routineVisitCount($plan[$second->toDateString()] ?? []) >= self::MAX_VISITS_PER_DAY) {
            $warnings[] = "Train {$trainId}: no K6/K5 track was available for the second G day.";

            return;
        }

        $this->put($plan, $second, $trainId, 'G');
    }

    private function balancedVisitDate(Carbon $lastVisit, Carbon $start, Carbon $end, string $trainId, string $code, array $plan, array $blocked, array $holidays): ?Carbon
    {
        $candidates = collect([15, 14, 16, 13, 17])
            ->map(fn ($gap) => ['gap' => $gap, 'date' => $lastVisit->copy()->addDays($gap)])
            ->sortBy(fn ($item) => [
                $this->routineVisitCount($plan[$item['date']->toDateString()] ?? []),
                abs(self::VISIT_TARGET - $item['gap']),
            ]);

        foreach ($candidates as $item) {
            $candidate = $item['date'];
            if (! $candidate->betweenIncluded($start, $end) || ! $this->isWorkingDay($candidate, $holidays)) {
                continue;
            }
            $key = $candidate->toDateString();
            if (! empty($blocked[$trainId][$key]) || ! empty($plan[$key][$trainId]) || $this->routineVisitCount($plan[$key] ?? []) >= self::MAX_VISITS_PER_DAY) {
                continue;
            }
            $heavyVisit = $this->isHeavyVisit($code);
            if (($heavyVisit && $this->nonOverhaulVisitCount($plan[$key] ?? []) > 0)
                || (! $heavyVisit && $this->hasHeavyVisit($plan[$key] ?? []))) {
                continue;
            }
            if ($code === 'G' && ! $this->hasAvailableSecondGDay($candidate, $end, $trainId, $plan, $blocked, $holidays)) {
                continue;
            }

            return $candidate;
        }

        return null;
    }

    private function hasAvailableSecondGDay(Carbon $first, Carbon $end, string $trainId, array $plan, array $blocked, array $holidays): bool
    {
        $second = $first->copy()->addDay();
        while ($second->lte($end) && ! $this->isWorkingDay($second, $holidays)) {
            $second->addDay();
        }
        if ($second->gt($end)) {
            return false;
        }

        $key = $second->toDateString();

        return empty($blocked[$trainId][$key])
            && empty($plan[$key][$trainId])
            && $this->nonOverhaulVisitCount($plan[$key] ?? []) === 0;
    }

    private function planMonthlyCVisits(array $trains, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $workingDates = collect(CarbonPeriod::create($start, $end))
            ->filter(fn ($date) => $this->isWorkingDay($date, $holidays))
            ->values();

        foreach ($trains as $index => $trainId) {
            $preferredIndex = ($index * 7 + $start->month) % max(1, $workingDates->count());
            $orderedDates = $workingDates->sortBy(fn ($date, $dateIndex) => abs($dateIndex - $preferredIndex));
            $routineDates = $past->where('train_id', $trainId)
                ->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')
                ->pluck('schedule_date')
                ->map(fn ($date) => $date->copy());
            foreach ($plan as $date => $entries) {
                $code = $entries[$trainId] ?? null;
                if ($code && ! $this->isNineYearCode($code) && $code !== 'C') {
                    $routineDates->push(Carbon::parse($date));
                }
            }

            $scheduled = false;
            foreach ($orderedDates as $date) {
                $key = $date->toDateString();
                $hasC = collect($plan[$key] ?? [])->contains(fn ($code) => $code === 'C');
                $tooClose = $routineDates->contains(fn ($routineDate) => $routineDate->diffInDays($date) < self::C_MIN_ROUTINE_GAP);
                if ($hasC || $tooClose || $this->hasHeavyVisit($plan[$key] ?? []) || ! empty($blocked[$trainId][$key]) || ! empty($plan[$key][$trainId])) {
                    continue;
                }

                $this->put($plan, $date, $trainId, 'C');
                $scheduled = true;
                break;
            }

            if (! $scheduled) {
                $warnings[] = "Train {$trainId}: no safe monthly C slot was available.";
            }
        }
    }

    private function assignTracks(array $plan, array &$meta): void
    {
        foreach ($plan as $date => $entries) {
            $routineTrains = [];
            foreach ($entries as $trainId => $code) {
                if ($code === 'C') {
                    $meta[$date]['k19'] = $trainId;
                } elseif (! $this->isNineYearCode($code)) {
                    $routineTrains[] = $trainId;
                }
            }

            if (isset($routineTrains[0])) {
                $meta[$date]['k6'] = $routineTrains[0];
            }
            if (isset($routineTrains[1])) {
                $meta[$date]['k5'] = $routineTrains[1];
            }
        }
    }

    private function routineVisitCount(array $entries): int
    {
        return collect($entries)
            ->reject(fn ($code) => $code === 'C' || $this->isNineYearCode($code))
            ->count();
    }

    private function nonOverhaulVisitCount(array $entries): int
    {
        return collect($entries)->reject(fn ($code) => $this->isNineYearCode($code))->count();
    }

    private function hasHeavyVisit(array $entries): bool
    {
        return collect($entries)->contains(fn ($code) => $this->isHeavyVisit($code));
    }

    private function isHeavyVisit(string $code): bool
    {
        return $code === 'G' || str_starts_with($code, 'B');
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
            if (! $this->isWorkingDay($emptyDate, $holidays)
                || $this->routineVisitCount($plan[$emptyKey] ?? []) > 0
                || $this->hasHeavyVisit($plan[$emptyKey] ?? [])) {
                continue;
            }

            $moved = false;
            foreach ([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7] as $offset) {
                $source = $emptyDate->copy()->addDays($offset);
                if (! $source->betweenIncluded($start, $end)) {
                    continue;
                }
                $sourceKey = $source->toDateString();
                if ($this->routineVisitCount($plan[$sourceKey] ?? []) < 2
                    || $this->hasHeavyVisit($plan[$sourceKey] ?? [])) {
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
                $trainIds = $past->pluck('train_id')->unique()->sort()->values();
                foreach ($trainIds as $trainId) {
                    if (! empty($blocked[$trainId][$emptyKey])
                        || ! empty($plan[$emptyKey][$trainId])
                        || ! $this->aMoveKeepsBalance($trainId, Carbon::parse('1900-01-01'), $emptyDate, $past, $plan)) {
                        continue;
                    }
                    $this->put($plan, $emptyDate, $trainId, 'A');
                    $moved = true;
                    break;
                }
            }
            if (! $moved) {
                $warnings[] = "{$emptyKey}: no routine visit could be moved here without breaking the 13-to-17-day cycle.";
            }
        }
    }

    private function aMoveKeepsBalance(string $trainId, Carbon $source, Carbon $target, Collection $past, array $plan): bool
    {
        $visits = $past->where('train_id', $trainId)
            ->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')
            ->map(fn ($row) => ['date' => $row->schedule_date->copy(), 'code' => $this->baseCode($row->code)]);

        foreach ($plan as $date => $entries) {
            $code = $entries[$trainId] ?? null;
            if ($code !== null
                && ! $this->isNineYearCode($code)
                && $code !== 'C'
                && $date !== $source->toDateString()) {
                $visits->push(['date' => Carbon::parse($date), 'code' => $this->baseCode($code)]);
            }
        }
        $visits->push(['date' => $target->copy(), 'code' => 'A']);
        $ordered = $visits->sortBy(fn ($visit) => $visit['date']->timestamp)->values();

        // A two-day G block is one maintenance event for cadence calculations.
        $dates = collect();
        foreach ($ordered as $visit) {
            $previous = $dates->last();
            if ($visit['code'] === 'G'
                && $previous
                && $previous['code'] === 'G'
                && $previous['date']->copy()->addDay()->isSameDay($visit['date'])) {
                continue;
            }
            $dates->push($visit);
        }

        $index = $dates->search(fn ($visit) => $visit['date']->isSameDay($target));
        if ($index === false) {
            return false;
        }
        if ($index > 0) {
            $previousGap = $dates[$index - 1]['date']->diffInDays($target);
            if ($previousGap < self::A_MIN || $previousGap > self::A_MAX) {
                return false;
            }
        }
        if ($index < $dates->count() - 1) {
            $nextGap = $target->diffInDays($dates[$index + 1]['date']);
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

    private function containsCode(string $value, string $code): bool
    {
        return in_array($code, array_map('trim', explode('+', strtoupper($value))), true);
    }

    private function isNineYearCode(string $code): bool
    {
        return str_starts_with(strtoupper($code), '9Y');
    }

    private function put(array &$plan, Carbon $date, string $trainId, string $code): void
    {
        $plan[$date->toDateString()][$trainId] = $code;
    }
}
