<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CcpAttendanceStatusOverrideTest extends TestCase
{
    use DatabaseTransactions;

    public function test_ccp_selected_late_status_is_kept_for_a_manual_row(): void
    {
        [$user, $employee] = $this->makeCcpAndEmployee();
        Sanctum::actingAs($user);

        $date = now()->toDateString();

        $this->postJson('/api/ccp/attendance/manual', [
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => '06:30',
            'check_out' => '15:30',
            'status' => 'late',
            'notes' => 'Reviewed by CCP',
        ])->assertOk()->assertJsonPath('data.status', 'late');

        $this->assertDatabaseHas('attendances', [
            'employee_id' => $employee->id,
            'date' => $date,
            'status' => 'late',
            'is_manual' => true,
        ]);
    }

    public function test_ccp_can_change_biometric_status_without_replacing_punch_times(): void
    {
        [$user, $employee] = $this->makeCcpAndEmployee();
        Sanctum::actingAs($user);

        $date = now()->subDay()->toDateString();
        Attendance::create([
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => '06:30:00',
            'check_out' => '15:30:00',
            'work_hours' => 9,
            'expected_hours' => 8,
            'status' => 'present',
            'is_manual' => false,
        ]);

        $this->postJson('/api/ccp/attendance/manual', [
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => '06:30',
            'check_out' => '15:30',
            'status' => 'late',
            'notes' => 'Late confirmed by CCP',
        ])->assertOk()
            ->assertJsonPath('data.status', 'late')
            ->assertJsonPath('data.is_manual', false);

        $record = Attendance::where('employee_id', $employee->id)
            ->whereDate('date', $date)
            ->firstOrFail();

        $this->assertSame('late', $record->status);
        $this->assertSame('06:30:00', $record->check_in);
        $this->assertSame('15:30:00', $record->check_out);
        $this->assertFalse($record->is_manual);
    }

    private function makeCcpAndEmployee(): array
    {
        $suffix = Str::lower(Str::random(8));
        $user = User::create([
            'name' => 'CCP Attendance Test',
            'email' => "ccp-attendance-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'ccp',
            'department' => 'cm_intervention',
            'is_active' => true,
        ]);

        $employee = Employee::create([
            'ibs_code' => 'CCP-' . $suffix,
            'punch_code' => (string) random_int(50000000, 59999999),
            'name' => 'CCP Attendance Employee ' . $suffix,
            'position' => 'Intervention Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
        ]);

        return [$user, $employee];
    }
}
