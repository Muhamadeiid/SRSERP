<?php

namespace Tests\Unit;

use App\Services\MaintenanceScheduleGenerator;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\CarbonPeriod;
use Tests\TestCase;

class MaintenanceScheduleSolverTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Disposable schema: never touch the configured ERP database
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'srs.machine_lock_enabled' => false]);
        DB::purge('sqlite');
        Schema::create('trains', function (Blueprint $table) {
            $table->string('id')->primary(); $table->string('name'); $table->integer('display_order'); $table->timestamps();
        });
        Schema::create('maintenance_schedule', function (Blueprint $table) {
            $table->id(); $table->date('schedule_date'); $table->string('train_id'); $table->string('code'); $table->timestamps();
        });
        Schema::create('public_holidays', function (Blueprint $table) {
            $table->id(); $table->date('date'); $table->date('end_date')->nullable(); $table->timestamps();
        });
    }

    public function test_month_gives_every_train_two_visits_with_clean_days(): void
    {
        // 20 trains that last visited in late October 2026, some with a B stage due in November
        $lastVisits = [
            '01' => '2026-10-17', '02' => '2026-10-31', '03' => '2026-10-31', '04' => '2026-10-26', '05' => '2026-10-18',
            '06' => '2026-10-29', '07' => '2026-10-24', '08' => '2026-10-19', '09' => '2026-10-27', '10' => '2026-10-22',
            '11' => '2026-10-28', '12' => '2026-10-25', '13' => '2026-10-27', '14' => '2026-10-22', '15' => '2026-10-24',
            '16' => '2026-10-20', '17' => '2026-10-21', '18' => '2026-10-29', '19' => '2026-10-18', '20' => '2026-10-15',
        ];
        $order = 1;
        foreach ($lastVisits as $train => $date) {
            DB::table('trains')->insert(['id' => $train, 'name' => "TS {$train}", 'display_order' => $order++]);
            DB::table('maintenance_schedule')->insert(['schedule_date' => Carbon::parse($date)->subDays(15)->toDateString(), 'train_id' => $train, 'code' => 'A']);
            DB::table('maintenance_schedule')->insert(['schedule_date' => $date, 'train_id' => $train, 'code' => 'A']);
        }

        $result = app(MaintenanceScheduleGenerator::class)->preview(2026, 11);
        $entries = $result["entries"];

        $visits = [];
        foreach ($entries as $day => $row) {
            $routine = array_filter($row, fn ($code) => $code !== 'C' && ! str_starts_with($code, '9Y'));
            $this->assertLessThanOrEqual(2, count($routine), "{$day}: more than two maintenance trains");
            if (array_filter($routine, fn ($code) => $code !== 'A')) {
                $this->assertCount(1, $routine, "{$day}: a B/G day must hold one maintenance train");
            }
            $this->assertLessThanOrEqual(1, count(array_filter($row, fn ($code) => $code === 'C')), "{$day}: more than one C");
            foreach ($routine as $train => $code) {
                $visits[$train][] = [$day, $code];
            }
        }

        foreach ($lastVisits as $train => $last) {
            // A two-day G is one visit
            $events = [];
            foreach ($visits[$train] ?? [] as [$day, $code]) {
                $previous = end($events);
                if ($code === 'G' && $previous && $previous[1] === 'G' && Carbon::parse($previous[0])->diffInDays(Carbon::parse($day)) <= 3) {
                    continue;
                }
                $events[] = [$day, $code];
            }
            $this->assertCount(2, $events, "Train {$train} should have exactly two visits");
            $previous = Carbon::parse($last);
            foreach ($events as [$day]) {
                $gap = $previous->diffInDays(Carbon::parse($day));
                $this->assertTrue($gap >= 13 && $gap <= 17, "Train {$train}: gap {$gap} before {$day}");
                $previous = Carbon::parse($day);
            }
        }

        // Every working day (not Friday) has a maintenance visit
        foreach (\Carbon\CarbonPeriod::create('2026-11-01', '2026-11-30') as $date) {
            if ($date->isFriday()) {
                continue;
            }
            $routine = array_filter($entries[$date->toDateString()] ?? [], fn ($code) => $code !== 'C' && ! str_starts_with($code, '9Y'));
            $this->assertNotEmpty($routine, $date->toDateString() . ' has no maintenance visit');
        }
    }

    public function test_nine_year_overhaul_lasts_thirty_working_days_excluding_fridays_and_public_holidays(): void
    {
        DB::table('trains')->insert([
            ['id' => 'O1', 'name' => 'Overhaul Train', 'display_order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['id' => 'O2', 'name' => 'Next Overhaul Train', 'display_order' => 2, 'created_at' => now(), 'updated_at' => now()],
        ]);

        foreach (CarbonPeriod::create('2026-09-20', '2026-09-30') as $date) {
            DB::table('maintenance_schedule')->insert([
                'schedule_date' => $date->toDateString(),
                'train_id' => 'O1',
                'code' => '9Y',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        DB::table('public_holidays')->insert([
            'date' => '2026-10-06',
            'end_date' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $preview = app(MaintenanceScheduleGenerator::class)->preview(2026, 10);
        $plannedDates = collect($preview['entries'])
            ->filter(fn ($entries) => ($entries['O1'] ?? null) === '9Y')
            ->keys();
        $allDates = collect(CarbonPeriod::create('2026-09-20', $plannedDates->max()))
            ->map(fn ($date) => $date->toDateString());
        $workingDays = $allDates->filter(fn ($date) => !Carbon::parse($date)->isFriday() && $date !== '2026-10-06');

        $this->assertCount(30, $workingDays);
        $this->assertContains('2026-10-06', $plannedDates);
        $this->assertTrue($plannedDates->contains(fn ($date) => Carbon::parse($date)->isFriday()));
    }
}
