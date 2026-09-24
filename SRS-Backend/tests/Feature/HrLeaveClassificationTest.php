<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HrLeaveClassificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_hr_can_change_leave_classification_while_approving(): void
    {
        $hr = User::create([
            'name' => 'HR Officer',
            'email' => 'hr-classification@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'hr',
        ]);
        $employee = Employee::create([
            'name' => 'Test Employee',
            'position' => 'Technician',
            'department' => 'CM',
            'status' => 'On Site',
        ]);
        LeaveBalance::create([
            'employee_id' => $employee->id,
            'annual' => 21,
            'casual' => 7,
            'sick' => 90,
            'early' => 0,
        ]);
        $leave = LeaveRequest::create([
            'tracking_no' => 'LRF-EG1-9998',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => '2026-07-28',
            'end_date' => '2026-07-28',
            'days' => 1,
            'status' => 'manager_approved',
        ]);

        $this->actingAs($hr)
            ->postJson("/api/leave-requests/{$leave->id}/hr-approve", [
                'leave_type' => 'early',
                'paid' => false,
                'early_from' => '08:00',
                'early_to' => '10:00',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'hr_approved')
            ->assertJsonPath('data.leave_type', 'early')
            ->assertJsonPath('data.paid', false)
            ->assertJsonPath('data.days', '0.25');

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leave->id,
            'leave_type' => 'early',
            'paid' => false,
            'days' => 0.25,
            'status' => 'hr_approved',
        ]);
    }

    public function test_hr_can_set_tracking_number_at_hr_approval_stage_for_leave_and_overtime(): void
    {
        $hr = User::create([
            'name' => 'Tracking HR Officer',
            'email' => 'hr-tracking@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'hr',
        ]);

        $leave = LeaveRequest::create([
            'employee_name' => 'Leave Employee',
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => '2026-09-28',
            'end_date' => '2026-09-28',
            'days' => 1,
            'status' => 'manager_approved',
        ]);
        $overtime = LeaveRequest::create([
            'employee_name' => 'Overtime Employee',
            'type' => 'otr',
            'ot_date' => '2026-09-28',
            'start_time' => '17:00',
            'end_time' => '19:00',
            'hours' => 2,
            'status' => 'manager_approved',
        ]);

        $this->actingAs($hr)
            ->putJson("/api/leave-requests/{$leave->id}/tracking-no", ['tracking_no' => 'LRF-EG1-014'])
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'LRF-EG1-014');

        $this->actingAs($hr)
            ->putJson("/api/leave-requests/{$overtime->id}/tracking-no", ['tracking_no' => 'OTR-GZ-007'])
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'OTR-GZ-007');
    }
}
