<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveRequestDirectManagerEditingTest extends TestCase
{
    use DatabaseTransactions;

    public function test_direct_manager_can_edit_their_employees_leave_before_final_approval(): void
    {
        [$manager, $employeeUser, $employee] = $this->employeeWithManager();
        $request = LeaveRequest::create([
            'tracking_no' => 'LRF-MANAGER-EDIT-' . Str::upper(Str::random(8)),
            'user_id' => $employeeUser->id,
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => false,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'days' => 1,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);
        $this->patchJson("/api/leave-requests/{$request->id}/details", [
            'leave_type' => 'casual',
            'paid' => false,
        ])->assertOk()
            ->assertJsonPath('data.leave_type', 'casual');
    }

    public function test_direct_manager_can_edit_their_employees_overtime_before_final_approval(): void
    {
        [$manager, $employeeUser, $employee] = $this->employeeWithManager();
        $request = LeaveRequest::create([
            'tracking_no' => 'OTR-MANAGER-EDIT-' . Str::upper(Str::random(8)),
            'user_id' => $employeeUser->id,
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'otr',
            'ot_date' => now()->addDay()->toDateString(),
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'start_time' => '17:00',
            'end_time' => '19:00',
            'hours' => 2,
            'days' => 0,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($manager);
        $this->patchJson("/api/leave-requests/{$request->id}/details", [
            'ot_date' => now()->addDays(2)->toDateString(),
            'start_time' => '18:00',
            'end_time' => '21:00',
        ])->assertOk()
            ->assertJsonPath('data.hours', 3);
    }

    private function employeeWithManager(): array
    {
        $suffix = Str::lower(Str::random(10));
        $manager = User::create([
            'name' => "Manager {$suffix}",
            'email' => "manager-edit-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'manager',
            'department' => 'admin',
            'is_active' => true,
        ]);
        $employeeUser = User::create([
            'name' => "Employee {$suffix}",
            'email' => "employee-edit-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'staff',
            'department' => 'admin',
            'is_active' => true,
        ]);
        $employee = Employee::create([
            'name' => $employeeUser->name,
            'position' => 'Test Position',
            'department' => 'admin',
            'category' => 'White Collar',
            'user_id' => $employeeUser->id,
            'user_manager_id' => $manager->id,
        ]);

        return [$manager, $employeeUser, $employee];
    }
}
