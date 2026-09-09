<?php

namespace Tests\Feature;

use App\Models\MaintenanceCode;
use App\Models\Train;
use App\Models\User;
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
            'name' => ucfirst($role) . ' Schedule ' . $token,
            'email' => "schedule-{$token}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => $role === 'manager' ? 'pm' : null,
            'is_active' => true,
        ]);
    }
}
