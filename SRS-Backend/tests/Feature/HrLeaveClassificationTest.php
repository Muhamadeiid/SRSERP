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

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leave->id,
            'tracking_no' => 'LRF-EG1-014',
        ]);
    }

    public function test_manual_tracking_number_controls_the_next_approved_request_number(): void
    {
        $hr = User::create([
            'name' => 'Tracking HR Officer',
            'email' => 'hr-sequence@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'hr',
        ]);
        $admin = User::create([
            'name' => 'Depot Admin',
            'email' => 'depot-sequence@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'admin',
        ]);
        $employee = Employee::create([
            'name' => 'Sequence Employee',
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
        $manual = LeaveRequest::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-01',
            'days' => 1,
            'status' => 'approved',
        ]);

        $this->actingAs($hr)
            ->putJson("/api/leave-requests/{$manual->id}/tracking-no", ['tracking_no' => ' lrf-eg1-014 '])
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'LRF-EG1-014');

        $next = LeaveRequest::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => '2026-10-15',
            'end_date' => '2026-10-15',
            'days' => 1,
            'status' => 'hr_approved',
        ]);

        $this->actingAs($admin)
            ->postJson("/api/leave-requests/{$next->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'LRF-EG1-015');
    }

    public function test_tracking_sequence_uses_leave_request_date_instead_of_approval_date(): void
    {
        $admin = User::create([
            'name' => 'Date Sequence Admin',
            'email' => 'date-sequence-admin@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'admin',
        ]);
        $employee = Employee::create([
            'name' => 'Date Sequence Employee',
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
        $later = LeaveRequest::create([
            'tracking_no' => 'LRF-EG1-014',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'request_date' => '2026-10-10',
            'start_date' => '2026-10-20',
            'end_date' => '2026-10-20',
            'days' => 1,
            'status' => 'approved',
        ]);
        $earlier = LeaveRequest::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'request_date' => '2026-10-01',
            'start_date' => '2026-10-15',
            'end_date' => '2026-10-15',
            'days' => 1,
            'status' => 'hr_approved',
        ]);

        $this->actingAs($admin)
            ->postJson("/api/leave-requests/{$earlier->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'LRF-EG1-014');

        $this->assertSame('LRF-EG1-015', $later->fresh()->tracking_no);
    }

    public function test_tracking_sequence_uses_overtime_form_date_instead_of_approval_date(): void
    {
        $admin = User::create([
            'name' => 'Overtime Date Admin',
            'email' => 'overtime-date-admin@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'admin',
        ]);
        $employee = Employee::create([
            'name' => 'Overtime Date Employee',
            'position' => 'Technician',
            'department' => 'CM',
            'status' => 'On Site',
        ]);
        $later = LeaveRequest::create([
            'tracking_no' => 'OTR-EG1-007',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'otr',
            'ot_date' => '2026-10-10',
            'start_time' => '17:00',
            'end_time' => '19:00',
            'hours' => 2,
            'status' => 'approved',
        ]);
        $earlier = LeaveRequest::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'otr',
            'ot_date' => '2026-10-01',
            'start_time' => '17:00',
            'end_time' => '19:00',
            'hours' => 2,
            'status' => 'hr_approved',
        ]);

        $this->actingAs($admin)
            ->postJson("/api/leave-requests/{$earlier->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.tracking_no', 'OTR-EG1-007');

        $this->assertSame('OTR-EG1-008', $later->fresh()->tracking_no);
    }
}
