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

    /** @var array<string, Carbon> latest 9Y day per train (history and this month) */
    private array $nineYearEnds = [];

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
        $this->nineYearEnds = [];
        foreach ($trains as $trainId) {
            $lastOverhaul = $this->latestOverhaulDate((string) $trainId, $past->where('train_id', $trainId), $plan);
            if ($lastOverhaul) {
                $this->nineYearEnds[(string) $trainId] = $lastOverhaul;
            }
        }

        $this->planRoutineVisitsForMonth($trains, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->ensureDailyCoverage($past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->planMonthlyCVisits($trains, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        $this->assignTracks($plan, $generatedMeta);

        ksort($plan);
        $cycleReport = $this->cycleReport($trains, $past, $start, $end, $plan);

        return [
            'cycle_report' => $cycleReport,
            'entries' => collect($plan)->map(fn ($rows) => collect($rows)->sortKeys()->all())->all(),
            'meta' => $generatedMeta,
            'warnings' => array_values(array_unique($warnings)),
            'replaces_existing' => $existing->isNotEmpty(),
            'existing_count' => $existing->count(),
            'rules' => ['visit_target' => 15, 'visit_min' => 13, 'visit_max' => 17, 'max_routine_visits_per_day' => 2, 'max_c_per_day' => 1, 'c_min_routine_gap' => 5],
        ];
    }

    // Local search for the monthly routine schedule
    private const SOLVER_STEPS = 150000;

    private const SOLVER_PATIENCE = 60000;

    private const SOLVER_RANDOM_PERCENT = 10;

    private const SOLVER_HARD_COST = 100000;

    private const SOLVER_UNCOVERED_COST = 1000;

    private const POSTPONE_B_DAYS = 10;

    private const POSTPONE_B_COST = 10;

    private const POSTPONE_G_COST = 5000;

    /**
     * How each train's B/G stage was worked out, oldest to newest: the visits on
     * record, the B/G reference used (saved schedule or the
     * 9Y restart), the next stage and its due date, and what was planned.
     */
    private function cycleReport(array $trains, Collection $past, Carbon $start, Carbon $end, array $plan): array
    {
        $report = [];
        foreach ($trains as $trainId) {
            $trainId = (string) $trainId;
            $trainPast = $past->where('train_id', $trainId)->sortBy('schedule_date')->values();
            $routinePast = $trainPast->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')->values();
            $history = $routinePast->map(fn ($row) => [$row->schedule_date->toDateString(), strtoupper((string) $row->code)])->values()->all();

            $nineYear = $trainPast->filter(fn ($row) => $this->isNineYearCode($row->code))->pluck('schedule_date')
                ->merge(collect($plan)->filter(fn ($entries) => isset($entries[$trainId]) && $this->isNineYearCode($entries[$trainId]))->keys()->map(fn ($day) => Carbon::parse($day)))
                ->sort()->values();

            $reference = $this->lastBReference($trainId, $routinePast, $start);
            $nextStage = $reference ? self::B_CYCLE[((int) array_search($reference['code'], self::B_CYCLE, true) + 1) % count(self::B_CYCLE)] : null;
            $due = $reference ? $reference['date']->copy()->addMonthsNoOverflow(3) : null;

            $planned = [];
            foreach ($plan as $day => $entries) {
                $code = $entries[$trainId] ?? null;
                if ($code && ! $this->isNineYearCode($code) && $code !== 'C') {
                    $planned[] = [$day, $code];
                }
            }
            usort($planned, fn ($a, $b) => strcmp($a[0], $b[0]));
            $plannedStage = collect($planned)->first(fn ($visit) => $visit[1] !== 'A');

            $status = 'not_due';
            if (! $reference) {
                $status = 'no_history';
            } elseif ($plannedStage) {
                $status = 'planned';
            } elseif ($due->copy()->subDays(8)->lte($end)) {
                $status = collect($planned)->isEmpty() ? 'no_visit' : 'postponed';
            }

            $report[] = [
                'train' => $trainId,
                'history' => array_slice($history, -6),
                'last_9y' => $nineYear->isEmpty() ? null : [$nineYear->first()->toDateString(), $nineYear->last()->toDateString()],
                'reference' => $reference ? ['date' => $reference['date']->toDateString(), 'code' => $reference['code'], 'source' => $reference['source'] ?? 'schedule'] : null,
                'next_stage' => $nextStage,
                'due' => $due?->toDateString(),
                'due_window_start' => $due?->copy()->subDays(8)->toDateString(),
                'planned' => $planned,
                'status' => $status,
            ];
        }

        return $report;
    }

    /**
     * Routine visits (A / B1 / B2 / B3 / G) for the whole month at once.
     *
     * Every train that is not in 9Y gets two visits in the month, each 13-17
     * days after the previous one, with at most two maintenance trains a day,
     * B/G days reserved for one train, and every working day covered. All
     * trains are solved together (backtracking) so a busy day can be resolved
     * by moving another train instead of leaving a train without a visit.
     * Trains entering or leaving 9Y this month keep the step-by-step planner.
     */
    private function planRoutineVisitsForMonth(array $trains, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $workingDays = collect(CarbonPeriod::create($start, $end))
            ->filter(fn ($date) => $this->isWorkingDay($date, $holidays))
            ->map(fn ($date) => $date->toDateString())
            ->values()
            ->all();

        $special = [];
        $normal = []; // train => overhaul end it resumes from, or null
        foreach ($trains as $trainId) {
            $trainId = (string) $trainId;
            $freeDays = array_filter($workingDays, fn ($day) => empty($blocked[$trainId][$day]));
            if (! $freeDays) {
                continue; // in 9Y for the whole month
            }
            $trainPast = $past->where('train_id', $trainId)->sortBy('schedule_date')->values();
            $lastVisit = $trainPast->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')
                ->last()?->schedule_date;
            $lastOverhaul = $this->latestOverhaulDate($trainId, $trainPast, $plan);
            $plannedOverhaul = $this->plannedOverhaulWindow($trainId, $plan);
            if ($plannedOverhaul && $plannedOverhaul['start']->gt($start)) {
                // entering 9Y this month: visits only before it, step-by-step planner
                $special[] = $trainId;
            } elseif ($lastOverhaul && (! $lastVisit || $lastOverhaul->gt($lastVisit))) {
                // back from 9Y: first visit is an A 13-17 days after the overhaul
                $normal[$trainId] = $lastOverhaul->copy();
            } else {
                $normal[$trainId] = null;
            }
        }

        if ($special) {
            $this->planRoutineVisits($special, $past, $start, $end, $plan, $blocked, $holidays, $warnings);
        }

        // Occupancy already fixed by 9Y-affected trains
        $load = [];
        $heavy = [];
        foreach ($plan as $day => $entries) {
            $load[$day] = $this->routineVisitCount($entries);
            $heavy[$day] = $this->hasHeavyVisit($entries);
        }

        $options = [];
        foreach ($normal as $trainId => $resumeFrom) {
            $trainId = (string) $trainId;
            $built = $this->routineOptions($trainId, $past, $start, $end, $plan, $blocked, $holidays, $resumeFrom);
            if (! $built) {
                $warnings[] = "Train {$trainId}: no visit history was found; no schedule was invented.";
                continue;
            }
            // Back from 9Y late in the month: its first visit falls in the next month
            $resumesNextMonth = $resumeFrom && $resumeFrom->copy()->addDays(self::A_MAX)->gt($end);
            if (! $built['options']) {
                if (! $resumesNextMonth) {
                    $warnings[] = "Train {$trainId}: no working day keeps the visit gap between 13 and 17 days.";
                }
                continue;
            }
            if (! $built['two_visits'] && ! $resumeFrom) {
                $warnings[] = "Train {$trainId}: only one visit fits in {$start->format('M Y')} with a 13-17 day gap.";
            }
            $options[$trainId] = $built['options'];
        }
        if (! $options) {
            return;
        }

        // First without postponing any due G; only if a train cannot be scheduled
        // that way is a G allowed to wait for a later visit.
        $strictOptions = [];
        foreach ($options as $trainId => $list) {
            $kept = array_values(array_filter($list, fn ($option) => $option['score'] < self::POSTPONE_G_COST));
            $strictOptions[$trainId] = $kept ?: $list;
        }
        $result = $this->solveRoutine($strictOptions, $workingDays, $load, $heavy);
        if ($result['unplaced'] > 0) {
            $relaxed = $this->solveRoutine($options, $workingDays, $load, $heavy);
            if ([$relaxed['unplaced'], $relaxed['uncovered']] < [$result['unplaced'], $result['uncovered']]) {
                $result = $relaxed;
            }
        }

        foreach ($result['assignment'] as $trainId => $option) {
            foreach ($option['visits'] as [$day, $code]) {
                $this->put($plan, Carbon::parse($day), (string) $trainId, $code);
            }
            foreach ($option['g_second'] as $day) {
                $this->put($plan, Carbon::parse($day), (string) $trainId, 'G');
            }
        }
        $placed = array_map('strval', array_keys($result['assignment']));
        foreach (array_keys($options) as $trainId) {
            if (! in_array((string) $trainId, $placed, true)) {
                $warnings[] = "Train {$trainId}: no combination of days fits this train with the other trains (2 per day, B/G alone).";
            }
        }
    }

    /**
     * Possible visit pairs for one train this month. A visit is A, or the next
     * B/G stage when it falls within 8 days of (or after) the B/G due date.
     */
    private function routineOptions(string $trainId, Collection $past, Carbon $start, Carbon $end, array $plan, array $blocked, array $holidays, ?Carbon $resumeFrom = null): ?array
    {
        $routinePast = $past->where('train_id', $trainId)
            ->reject(fn ($row) => $this->isNineYearCode($row->code) || strtoupper((string) $row->code) === 'C')
            ->sortBy('schedule_date')
            ->values();
        $lastRow = $routinePast->last();
        if (! $lastRow && ! $resumeFrom) {
            return null;
        }
        $last = $resumeFrom ? $resumeFrom->copy() : $lastRow->schedule_date->copy();
        // A two-day G counts from its first day
        if (! $resumeFrom && $this->baseCode((string) $lastRow->code) === 'G' && $routinePast->count() > 1) {
            $previous = $routinePast[$routinePast->count() - 2];
            if ($this->baseCode((string) $previous->code) === 'G' && $previous->schedule_date->diffInDays($last) <= 3) {
                $last = $previous->schedule_date->copy();
            }
        }
        $reference = $this->lastBReference($trainId, $routinePast, $start);
        $bCode = $reference['code'] ?? null;
        $bDue = isset($reference['date']) ? $reference['date']->copy()->addMonthsNoOverflow(3) : null;

        $usable = function (Carbon $date) use ($trainId, $start, $end, $plan, $blocked, $holidays): bool {
            $key = $date->toDateString();

            return $date->betweenIncluded($start, $end)
                && $this->isWorkingDay($date, $holidays)
                && empty($blocked[$trainId][$key])
                && empty($plan[$key][$trainId]);
        };
        $candidates = function (Carbon $previous) use ($usable, $start): array {
            $dates = [];
            foreach ([15, 14, 16, 13, 17] as $gap) {
                $date = $previous->copy()->addDays($gap);
                if ($usable($date)) {
                    $dates[] = [$date, $gap];
                }
            }
            if (! $dates && $previous->lt($start)) {
                // Overdue from earlier months (or its window had no working day):
                // first working days of this month
                for ($offset = 0; $offset <= 6 && count($dates) < 3; $offset++) {
                    $date = $start->copy()->addDays($offset);
                    if ($usable($date)) {
                        $dates[] = [$date, 15];
                    }
                }
            }

            return $dates;
        };
        $visit = function (Carbon $date, ?string $code, ?Carbon $due, bool $postpone = false) use ($usable, $end, $holidays): ?array {
            $isB = ! $postpone && $code && $due && $date->gte($due->copy()->subDays(8));
            $visitCode = $isB ? self::B_CYCLE[((int) array_search($code, self::B_CYCLE, true) + 1) % count(self::B_CYCLE)] : 'A';
            $second = [];
            if ($visitCode === 'G') {
                $next = $date->copy()->addDay();
                while ($next->lte($end) && ! $this->isWorkingDay($next, $holidays)) {
                    $next->addDay();
                }
                if (! $usable($next)) {
                    return null;
                }
                $second[] = $next->toDateString();
            }

            return [
                'date' => $date->toDateString(),
                'code' => $visitCode,
                'heavy' => $visitCode !== 'A',
                'second' => $second,
                'b_code' => $isB ? $visitCode : $code,
                'b_due' => $isB ? $date->copy()->addMonthsNoOverflow(3) : $due,
            ];
        };

        // A due B1/B2/B3 may also be postponed to a later visit (into next month if
        // needed) when its day is required by another train; this keeps a month
        // with many B dues solvable. Each postponement costs more than any gap
        // difference, so the solver postpones as few as possible. A G waits only as a last resort.
        $variants = function (Carbon $date, ?string $code, ?Carbon $due) use ($visit): array {
            $planned = $visit($date, $code, $due);
            $list = $planned ? [[$planned, 0]] : [];
            $nextStage = $code ? self::B_CYCLE[((int) array_search($code, self::B_CYCLE, true) + 1) % count(self::B_CYCLE)] : null;
            if ($code && $due && $date->gte($due->copy()->subDays(8))) {
                // already overdue B costs more to postpone again. A G waits only when
                // otherwise a train could not be scheduled at all: it costs more than
                // leaving a working day without maintenance.
                $cost = $nextStage === 'G'
                    ? self::POSTPONE_G_COST
                    : ($date->lt($due->copy()->addDays(self::POSTPONE_B_DAYS)) ? self::POSTPONE_B_COST : self::POSTPONE_B_COST * 3);
                $list[] = [$visit($date, $code, $due, true), $cost];
            }

            return $list;
        };

        $pairs = [];
        $singles = [];
        foreach ($candidates($last) as [$firstDate, $gap1]) {
            $firstVariants = $resumeFrom
                ? [[$visit($firstDate, $bCode, $bDue, true), 0]] // first visit after 9Y is always A
                : $variants($firstDate, $bCode, $bDue);
            foreach ($firstVariants as [$first, $cost1]) {
                $seconds = [];
                foreach ($candidates($firstDate) as [$secondDate, $gap2]) {
                    // The month's last visit must leave the next one in the next month;
                    // otherwise the train would need a third visit or a gap over 17 days.
                    if (! $this->nextVisitFitsNextMonth($secondDate, $end, $holidays)) {
                        continue;
                    }
                    foreach ($variants($secondDate, $first['b_code'], $first['b_due']) as [$secondVisit, $cost2]) {
                        $seconds[] = [$secondVisit, $gap2, $cost2];
                    }
                }
                foreach ($seconds as [$secondVisit, $gap2, $cost2]) {
                    $pairs[] = $this->routineOption([$first, $secondVisit], abs($gap1 - 15) + abs($gap2 - 15) + $cost1 + $cost2);
                }
                if (! $seconds && $firstDate->copy()->addDays(self::A_MIN)->gt($end)) {
                    $singles[] = $this->routineOption([$first], abs($gap1 - 15) + $cost1);
                }
            }
        }

        $options = $pairs ?: $singles;
        usort($options, fn ($a, $b) => $a['score'] <=> $b['score']);

        return ['options' => $options, 'two_visits' => (bool) $pairs];
    }

    /** A working day 13-17 days after $last must exist after the end of the month. */
    private function nextVisitFitsNextMonth(Carbon $last, Carbon $end, array $holidays): bool
    {
        foreach (range(self::A_MIN, self::A_MAX) as $gap) {
            $date = $last->copy()->addDays($gap);
            if ($date->gt($end) && $this->isWorkingDay($date, $holidays)) {
                return true;
            }
        }

        return false;
    }

    private function routineOption(array $visits, int $score): array
    {
        $days = [];
        $gSecond = [];
        foreach ($visits as $visit) {
            $days[$visit['date']] = $visit['heavy'];
            foreach ($visit['second'] as $day) {
                $days[$day] = true;
                $gSecond[] = $day;
            }
        }

        return [
            'visits' => array_map(fn ($visit) => [$visit['date'], $visit['code']], $visits),
            'g_second' => $gSecond,
            'days' => $days,
            'score' => $score,
        ];
    }

    /**
     * Chooses one option per train for the whole month (local search).
     *
     * Hard rules: at most two maintenance trains a day, and a B/G day holds only
     * that train. Soft goals: every working day has a visit, gaps close to 15 days,
     * few B/G postponements. Starting from each train's best option, it keeps
     * re-choosing the option of a train involved in a problem day, picking the
     * change that lowers the total cost (with occasional random moves to escape
     * dead ends). Deterministic: the same month always gives the same schedule.
     * Trains still breaking a hard rule at the end are left out and reported.
     */
    private function solveRoutine(array $options, array $workingDays, array $load, array $heavy): array
    {
        $trainIds = array_map('strval', array_keys($options));
        $fixedLoad = $load;
        $fixedHeavy = $heavy;
        $working = array_fill_keys($workingDays, true);
        mt_srand(20260915);

        $dayLoad = [];
        $dayHeavy = [];
        $dayCost = function (string $day, int $addLoad = 0, int $addHeavy = 0) use (&$dayLoad, &$dayHeavy, $fixedLoad, $fixedHeavy, $working): int {
            $count = ($dayLoad[$day] ?? 0) + ($fixedLoad[$day] ?? 0) + $addLoad;
            $heavyCount = ($dayHeavy[$day] ?? 0) + (! empty($fixedHeavy[$day]) ? 1 : 0) + $addHeavy;
            $hard = max(0, $count - self::MAX_VISITS_PER_DAY) + ($heavyCount > 0 ? $count - 1 : 0);
            $uncovered = isset($working[$day]) && $count === 0 ? 1 : 0;

            return $hard * self::SOLVER_HARD_COST + $uncovered * self::SOLVER_UNCOVERED_COST;
        };
        $toggle = function (array $option, int $direction) use (&$dayLoad, &$dayHeavy): void {
            foreach ($option['days'] as $day => $isHeavy) {
                $dayLoad[$day] = ($dayLoad[$day] ?? 0) + $direction;
                if ($isHeavy) {
                    $dayHeavy[$day] = ($dayHeavy[$day] ?? 0) + $direction;
                }
            }
        };

        $choice = [];
        foreach ($trainIds as $trainId) {
            $choice[$trainId] = 0; // options are sorted cheapest first
            $toggle($options[$trainId][0], 1);
        }
        $allDays = array_keys($working);
        foreach ($options as $list) {
            foreach ($list as $option) {
                foreach (array_keys($option['days']) as $day) {
                    $allDays[] = $day;
                }
            }
        }
        $allDays = array_values(array_unique($allDays));
        $total = function () use ($allDays, $dayCost, &$choice, $options): int {
            $cost = 0;
            foreach ($allDays as $day) {
                $cost += $dayCost($day);
            }
            foreach ($choice as $trainId => $index) {
                $cost += $options[$trainId][$index]['score'];
            }

            return $cost;
        };

        $cost = $total();
        $bestCost = $cost;
        $bestChoice = $choice;

        $lastImprovement = 0;
        for ($step = 0; $step < self::SOLVER_STEPS; $step++) {
            // stop once the schedule is clean and has not improved for a while
            if ($bestCost < self::SOLVER_UNCOVERED_COST && $step - $lastImprovement > self::SOLVER_PATIENCE) {
                break;
            }
            // Trains touching a day with a problem; any train once the hard rules hold
            $problemDays = array_filter($allDays, fn ($day) => $dayCost($day) > 0);
            $candidates = [];
            foreach ($trainIds as $trainId) {
                $current = $options[$trainId][$choice[$trainId]];
                foreach ($problemDays as $day) {
                    if (isset($current['days'][$day])) {
                        $candidates[] = $trainId;
                        break;
                    }
                }
            }
            if (! $candidates) {
                $candidates = $trainIds; // uncovered days: someone has to move there
            }
            $trainId = $candidates[mt_rand(0, count($candidates) - 1)];
            $currentIndex = $choice[$trainId];
            $current = $options[$trainId][$currentIndex];

            // Cost change of switching this train to each of its options: only the
            // option's own days change once the current choice is taken out
            $removed = -$current['score'];
            foreach (array_keys($current['days']) as $day) {
                $removed -= $dayCost($day);
            }
            $toggle($current, -1);
            foreach (array_keys($current['days']) as $day) {
                $removed += $dayCost($day);
            }
            $bestMove = null;
            $bestDelta = PHP_INT_MAX;
            $ties = 0;
            foreach ($options[$trainId] as $index => $option) {
                $delta = $option['score'];
                foreach ($option['days'] as $day => $isHeavy) {
                    $delta += $dayCost($day, 1, $isHeavy ? 1 : 0) - $dayCost($day);
                }
                if ($delta < $bestDelta) {
                    $bestDelta = $delta;
                    $bestMove = $index;
                    $ties = 1;
                } elseif ($delta === $bestDelta && mt_rand(1, ++$ties) === 1) {
                    $bestMove = $index;
                }
            }
            if (mt_rand(1, 100) <= self::SOLVER_RANDOM_PERCENT) {
                $bestMove = mt_rand(0, count($options[$trainId]) - 1);
                $bestDelta = $options[$trainId][$bestMove]['score'];
                foreach ($options[$trainId][$bestMove]['days'] as $day => $isHeavy) {
                    $bestDelta += $dayCost($day, 1, $isHeavy ? 1 : 0) - $dayCost($day);
                }
            }
            $toggle($options[$trainId][$bestMove], 1);
            $choice[$trainId] = $bestMove;
            $cost += $removed + $bestDelta;
            if ($cost < $bestCost) {
                $bestCost = $cost;
                $bestChoice = $choice;
                $lastImprovement = $step;
            }
        }

        // Rebuild the best state; leave out trains that still break a hard rule
        $dayLoad = [];
        $dayHeavy = [];
        foreach ($bestChoice as $trainId => $index) {
            $toggle($options[$trainId][$index], 1);
        }
        $assignment = [];
        foreach ($bestChoice as $trainId => $index) {
            $assignment[$trainId] = $options[$trainId][$index];
        }
        $unplaced = 0;
        foreach ($trainIds as $trainId) {
            $option = $assignment[$trainId];
            $breaks = false;
            foreach (array_keys($option['days']) as $day) {
                if ($dayCost($day) >= self::SOLVER_HARD_COST) {
                    $breaks = true;
                    break;
                }
            }
            if ($breaks) {
                $toggle($option, -1);
                unset($assignment[$trainId]);
                $unplaced++;
            }
        }
        $uncovered = 0;
        foreach ($workingDays as $day) {
            if (($dayLoad[$day] ?? 0) + ($fixedLoad[$day] ?? 0) === 0) {
                $uncovered++;
            }
        }

        return ['unplaced' => $unplaced, 'uncovered' => $uncovered, 'score' => $bestCost, 'assignment' => $assignment];
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

            if ($plannedOverhaul && $plannedOverhaul['start']->gt($start)) {
                $scheduleEnd = $plannedOverhaul['start']->copy()->subDay();
                $lastOverhaul = null;
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
                $code = $resumingAfterOverhaul ? 'A' : $this->nextVisitCode($target, $lastBCode, $nextBDue);
                $date = $this->balancedVisitDate($lastVisit, $start, $scheduleEnd, $trainId, $code, $plan, $blocked, $holidays, $past);
                if (! $date) {
                    // Only a real gap when the whole 13-17 day window lies inside this
                    // schedule. If part of it falls in the next month, the next visit
                    // simply belongs to that month and is planned when it is generated.
                    $windowStart = $lastVisit->copy()->addDays(self::A_MIN);
                    $windowEnd = $lastVisit->copy()->addDays(self::A_MAX);
                    if ($windowEnd->lte($scheduleEnd) && $windowEnd->gte($start)) {
                        $warnings[] = "Train {$trainId}: no slot keeps the visit gap between 13 and 17 days ("
                            . $windowStart->format('d M') . ' - ' . $windowEnd->format('d M') . ').';
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
            'source' => 'schedule',
        ] : null;

        // The 9Y overhaul restarts the B/G cycle: the first stage after it is B1,
        // about three months after the overhaul ends.
        $overhaulEnd = $this->nineYearEnds[$trainId] ?? null;
        if ($overhaulEnd && (! $reference || $overhaulEnd->gt($reference['date']))) {
            $reference = ['date' => $overhaulEnd->copy(), 'code' => 'G', 'source' => '9y'];
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

    private function balancedVisitDate(Carbon $lastVisit, Carbon $start, Carbon $end, string $trainId, string $code, array &$plan, array $blocked, array $holidays, Collection $past): ?Carbon
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
            if (! empty($blocked[$trainId][$key]) || ! empty($plan[$key][$trainId])) {
                continue;
            }
            $heavyVisit = $this->isHeavyVisit($code);
            if ($this->hasHeavyVisit($plan[$key] ?? [])) {
                continue;
            }
            $requiredSlots = $heavyVisit
                ? $this->nonOverhaulVisitCount($plan[$key] ?? [])
                : max(0, $this->routineVisitCount($plan[$key] ?? []) - self::MAX_VISITS_PER_DAY + 1);
            if ($requiredSlots > 0 && ! $this->relocateAVisits($candidate, $requiredSlots, $start, $end, $past, $plan, $blocked, $holidays)) {
                continue;
            }
            if ($code === 'G' && ! $this->prepareSecondGDay($candidate, $start, $end, $trainId, $past, $plan, $blocked, $holidays)) {
                continue;
            }

            return $candidate;
        }

        return null;
    }

    private function relocateAVisits(Carbon $source, int $count, Carbon $start, Carbon $end, Collection $past, array &$plan, array $blocked, array $holidays): bool
    {
        $sourceKey = $source->toDateString();
        $aTrains = collect($plan[$sourceKey] ?? [])->filter(fn ($code) => $code === 'A')->keys()->values();
        if ($aTrains->count() < $count) return false;

        $candidatePlan = $plan;
        foreach ($aTrains->take($count) as $movingTrain) {
            $targets = collect(CarbonPeriod::create($start, $end))
                ->filter(fn ($date) => !$date->isSameDay($source) && $this->isWorkingDay($date, $holidays))
                ->sortBy(fn ($date) => [$source->diffInDays($date), $this->routineVisitCount($candidatePlan[$date->toDateString()] ?? [])]);
            $moved = false;
            foreach ($targets as $target) {
                $targetKey = $target->toDateString();
                if (!empty($blocked[$movingTrain][$targetKey])
                    || !empty($candidatePlan[$targetKey][$movingTrain])
                    || $this->hasHeavyVisit($candidatePlan[$targetKey] ?? [])
                    || $this->routineVisitCount($candidatePlan[$targetKey] ?? []) >= self::MAX_VISITS_PER_DAY
                    || !$this->aMoveKeepsBalance((string) $movingTrain, $source, $target, $past, $candidatePlan)) {
                    continue;
                }
                unset($candidatePlan[$sourceKey][$movingTrain]);
                if (empty($candidatePlan[$sourceKey])) unset($candidatePlan[$sourceKey]);
                $this->put($candidatePlan, $target, (string) $movingTrain, 'A');
                $moved = true;
                break;
            }
            if (!$moved) return false;
        }

        $plan = $candidatePlan;
        return true;
    }

    private function prepareSecondGDay(Carbon $first, Carbon $start, Carbon $end, string $trainId, Collection $past, array &$plan, array $blocked, array $holidays): bool
    {
        $second = $first->copy()->addDay();
        while ($second->lte($end) && ! $this->isWorkingDay($second, $holidays)) $second->addDay();
        if ($second->gt($end)) return false;

        $key = $second->toDateString();
        if (!empty($blocked[$trainId][$key]) || !empty($plan[$key][$trainId]) || $this->hasHeavyVisit($plan[$key] ?? [])) return false;

        $visitsToMove = $this->nonOverhaulVisitCount($plan[$key] ?? []);
        if ($visitsToMove > 0 && !$this->relocateAVisits($second, $visitsToMove, $start, $end, $past, $plan, $blocked, $holidays)) return false;

        return $this->nonOverhaulVisitCount($plan[$key] ?? []) === 0;
    }

    /**
     * One C (cleaning) visit per train per month, at most one C a day, never on a
     * B/G day, during 9Y, or within 5 days of the same train's routine visits.
     * Trains are matched to days together (bipartite matching), so a train with
     * few possible days is not crowded out by trains that had many choices.
     */
    private function planMonthlyCVisits(array $trains, Collection $past, Carbon $start, Carbon $end, array &$plan, array $blocked, array $holidays, array &$warnings): void
    {
        $workingDates = collect(CarbonPeriod::create($start, $end))
            ->filter(fn ($date) => $this->isWorkingDay($date, $holidays))
            ->values();

        $candidates = [];
        $dayLevels = [];
        foreach ($trains as $trainId) {
            $trainId = (string) $trainId;
            // A train in 9Y for every working day of the month needs no cleaning visit
            if ($workingDates->every(fn ($date) => ! empty($blocked[$trainId][$date->toDateString()]))) {
                continue;
            }
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

            // Days by how far they bend the rule: level 0 keeps C_MIN_ROUTINE_GAP
            // and avoids B/G days; higher levels are only used when needed
            $levels = [];
            foreach ($workingDates as $date) {
                $key = $date->toDateString();
                if (collect($plan[$key] ?? [])->contains(fn ($code) => $code === 'C')
                    || ! empty($blocked[$trainId][$key])
                    || ! empty($plan[$key][$trainId])) {
                    continue;
                }
                $distance = $routineDates->map(fn ($routineDate) => $routineDate->diffInDays($date))->min() ?? 99;
                if ($distance < 1) {
                    continue;
                }
                $level = max(0, self::C_MIN_ROUTINE_GAP - $distance) + ($this->hasHeavyVisit($plan[$key] ?? []) ? self::C_MIN_ROUTINE_GAP : 0);
                $levels[$level][$key] = $distance;
            }
            ksort($levels);
            $dayLevels[$trainId] = $levels;
            $candidates[$trainId] = $this->cCandidates($levels, 0);
        }

        // Kuhn's augmenting paths; trains with the fewest days go first
        uksort($candidates, fn ($a, $b) => count($candidates[$a]) <=> count($candidates[$b]) ?: strcmp((string) $a, (string) $b));
        $dayOwner = [];
        $assign = function (string $trainId, array &$seen) use (&$assign, &$dayOwner, &$candidates): bool {
            foreach ($candidates[$trainId] as $day) {
                if (isset($seen[$day])) {
                    continue;
                }
                $seen[$day] = true;
                if (! isset($dayOwner[$day]) || $assign($dayOwner[$day], $seen)) {
                    $dayOwner[$day] = $trainId;

                    return true;
                }
            }

            return false;
        };
        foreach (array_keys($candidates) as $trainId) {
            $trainId = (string) $trainId;
            $seen = [];
            if ($assign($trainId, $seen)) {
                continue;
            }
            // No day keeps the rule: allow closer days for this train only, one step at a time
            $placed = false;
            foreach (array_keys($dayLevels[$trainId]) as $level) {
                if ($level === 0) {
                    continue;
                }
                $candidates[$trainId] = $this->cCandidates($dayLevels[$trainId], $level);
                $seen = [];
                if ($assign($trainId, $seen)) {
                    $placed = true;
                    break;
                }
            }
            if (! $placed) {
                $warnings[] = "Train {$trainId}: no monthly C slot was available.";
            }
        }
        foreach ($dayOwner as $day => $trainId) {
            $level = collect($dayLevels[(string) $trainId])->search(fn ($days) => isset($days[$day]));
            if ($level > 0) {
                $distance = $dayLevels[(string) $trainId][$level][$day];
                $reasons = [];
                if ($distance < self::C_MIN_ROUTINE_GAP) {
                    $reasons[] = "only {$distance} day(s) from its visit";
                }
                if ($this->hasHeavyVisit($plan[$day] ?? [])) {
                    $reasons[] = 'on a B/G day';
                }
                $warnings[] = "Train {$trainId}: C on {$day} is ".implode(' and ', $reasons).' (no better day was free).';
            }
        }
        foreach ($dayOwner as $day => $trainId) {
            $this->put($plan, Carbon::parse($day), (string) $trainId, 'C');
        }
    }

    /** C days up to the given level, best level first, then farthest from the visits */
    private function cCandidates(array $levels, int $maxLevel): array
    {
        $days = [];
        foreach ($levels as $level => $byDay) {
            if ($level > $maxLevel) {
                break;
            }
            arsort($byDay);
            array_push($days, ...array_keys($byDay));
        }

        return $days;
    }

    private function assignTracks(array $plan, array &$meta): void
    {
        foreach ($plan as $date => $entries) {
            $routineTrains = [];
            foreach ($entries as $trainId => $code) {
                if ($code === 'C') {
                    $meta[$date]['k19'] = (string) $trainId;
                } elseif (! $this->isNineYearCode($code)) {
                    $routineTrains[] = (string) $trainId;
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
