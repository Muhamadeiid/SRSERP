<?php

namespace Tests\Feature;

use App\Models\MaintenanceCode;
use App\Models\MaintenanceSchedule;
use App\Models\Train;
use App\Models\User;
use App\Services\MaintenanceScheduleGenerator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceScheduleApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_authorized_user_can_save_month_diff_and_meta(): void
    {
        $this->seedOptions();
        Sanctum::actingAs($this->user('depot_manager'));

        $this->postJson('/api/schedule/batch', [
            'changes' => [
                ['date' => '2026-09-01', 'train_id' => '01', 'code' => 'A'],
                ['date' => '2026-09-02', 'train_id' => '02', 'code' => 'B2'],
            ],
            'meta' => [[
                'date' => '2026-09-01', 'k6' => '12', 'k5' => '',
                'c_col' => '1', 'k19' => '9', 'remark' => 'Night test',
            ]],
        ])->assertOk();

        $this->assertDatabaseHas('maintenance_schedule', ['schedule_date' => '2026-09-01', 'train_id' => '01', 'code' => 'A']);
        $this->assertDatabaseHas('schedule_day_meta', ['schedule_date' => '2026-09-01', 'remark' => 'Night test']);

        $this->postJson('/api/schedule/batch', [
            'changes' => [['date' => '2026-09-01', 'train_id' => '01', 'code' => null]],
            'meta' => [],
        ])->assertOk();
        $this->assertDatabaseMissing('maintenance_schedule', ['schedule_date' => '2026-09-01', 'train_id' => '01']);
    }

    public function test_unrelated_staff_cannot_view_or_edit_schedule(): void
    {
        Sanctum::actingAs($this->user('staff'));
        $this->getJson('/api/schedule?year=2026&month=9')->assertForbidden();
        $this->postJson('/api/schedule/batch', ['changes' => [], 'meta' => []])->assertForbidden();
    }

    public function test_generated_visit_types_share_the_same_thirteen_to_seventeen_day_cycle(): void
    {
        foreach (['A', 'B1', 'B2', 'C'] as $code) {
            MaintenanceCode::updateOrCreate(
                ['code' => $code],
                ['name' => "Type {$code}", 'color_hex' => '#FFFFFF']
            );
        }
        foreach (['T1', 'T2', 'T3'] as $index => $trainId) {
            Train::updateOrCreate(['id' => $trainId], ['name' => "Test Train {$trainId}", 'display_order' => 990 + $index]);
            MaintenanceSchedule::insert([
                ['schedule_date' => '2026-07-05', 'train_id' => $trainId, 'code' => 'B1'],
                ['schedule_date' => '2026-09-05', 'train_id' => $trainId, 'code' => 'C'],
                ['schedule_date' => '2026-09-20', 'train_id' => $trainId, 'code' => 'A'],
            ]);
        }

        $preview = app(MaintenanceScheduleGenerator::class)->preview(2026, 10);
        $visits = collect($preview['entries'])
            ->map(fn ($entries, $date) => isset($entries['T1']) ? ['date' => $date, 'code' => $entries['T1']] : null)
            ->filter()
            ->values();

        $routine = $visits->reject(fn ($visit) => $visit['code'] === 'C')->values();
        $cVisit = $visits->firstWhere('code', 'C');

        $this->assertSame('B2', $routine->first()['code']);
        $this->assertNotNull($cVisit);
        $dates = collect(['2026-09-20'])->concat($routine->pluck('date'))->map(fn ($date) => Carbon::parse($date))->values();
        for ($index = 1; $index < $dates->count(); $index++) {
            $gap = $dates[$index - 1]->diffInDays($dates[$index]);
            $this->assertGreaterThanOrEqual(13, $gap);
            $this->assertLessThanOrEqual(17, $gap);
        }

        $cDate = Carbon::parse($cVisit['date']);
        $this->assertGreaterThanOrEqual(5, $dates->min(fn ($date) => $date->diffInDays($cDate)));
        $this->assertSame('T1', $preview['meta'][$cVisit['date']]['k19']);
        foreach ($preview['entries'] as $date => $entries) {
            $routineCount = collect($entries)->reject(fn ($code) => $code === 'C' || str_starts_with($code, '9Y'))->count();
            $cCount = collect($entries)->filter(fn ($code) => $code === 'C')->count();
            $this->assertLessThanOrEqual(2, $routineCount, "More than two K6/K5 visits were planned on {$date}.");
            $this->assertLessThanOrEqual(1, $cCount, "More than one C visit was planned on {$date}.");
        }
        foreach ($routine as $visit) {
            $this->assertSame('T1', $preview['meta'][$visit['date']]['k6']);
        }
    }

    private function seedOptions(): void
    {
        Train::updateOrCreate(['id' => '01'], ['name' => 'Train 01', 'display_order' => 1]);
        Train::updateOrCreate(['id' => '02'], ['name' => 'Train 02', 'display_order' => 2]);
        MaintenanceCode::updateOrCreate(['code' => 'A'], ['name' => 'Type A Inspection', 'color_hex' => '#FFEB3B']);
        MaintenanceCode::updateOrCreate(['code' => 'B2'], ['name' => 'Type B2 Maintenance', 'color_hex' => '#8BC34A']);
    }

    private function user(string $role): User
    {
        $token = Str::lower(Str::random(10));

        return User::create([
            'name' => ucfirst($role).' Schedule '.$token,
            'email' => "schedule-{$token}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => $role === 'manager' ? 'pm' : null,
            'is_active' => true,
        ]);
    }
}
