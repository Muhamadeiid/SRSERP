<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveAmendmentApprovalTest extends TestCase
{
    use DatabaseTransactions;

    public function test_moving_an_early_leave_keeps_its_type_and_days(): void
    {
        [$leave, $employee] = $this->approvedEarlyLeave('08:00', '09:00');

        $this->amend($leave, '2096-11-15', '15:00', '17:00');
        $this->approve($leave)->assertOk();

        $leave->refresh();
        $this->assertSame('approved', $leave->status);
        $this->assertSame('2096-11-15', $leave->start_date->toDateString());
        $this->assertSame('15:00', substr((string) $leave->early_from, 0, 5));
        $this->assertSame('early', $leave->leave_type);
        $this->assertEquals(0.25, (float) $leave->days);
        // Same days: the balance is restored and taken again, unchanged
        $this->assertEquals(20.75, (float) LeaveBalance::where('employee_id', $employee->id)->value('annual_remaining'));
    }

    public function test_a_longer_early_leave_takes_the_extra_days(): void
    {
        [$leave, $employee] = $this->approvedEarlyLeave('08:00', '09:00');

        $this->amend($leave, '2096-11-16', '08:00', '11:00');
        $this->approve($leave)->assertOk();

        $this->assertEquals(0.5, (float) $leave->fresh()->days);
        $this->assertEquals(20.5, (float) LeaveBalance::where('employee_id', $employee->id)->value('annual_remaining'));
    }

    private function approvedEarlyLeave(string $from, string $to): array
    {
        $suffix = Str::lower(Str::random(8));
        $owner = $this->user('staff');
        $employee = Employee::create([
            'ibs_code' => 'AMD-'.$suffix,
            'name' => 'Amendment Employee '.$suffix,
            'position' => 'Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
            'user_id' => $owner->id,
        ]);
        LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'annual_remaining' => 20.75, 'casual' => 7, 'casual_remaining' => 7, 'sick' => 90, 'early' => 0]);

        $leave = LeaveRequest::create([
            'type' => 'lrf',
            'user_id' => $owner->id,
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'leave_type' => 'early',
            'start_date' => '2096-11-16',
            'end_date' => '2096-11-16',
            'early_from' => $from,
            'early_to' => $to,
            'days' => 0.25,
            'paid' => true,
            'company_paid' => false,
            'status' => 'approved',
            'balance_deducted_at' => now(),
            'tracking_no' => 'LRF-T-'.$suffix,
        ]);

        return [$leave, $employee];
    }

    private function amend(LeaveRequest $leave, string $date, string $from, string $to): void
    {
        Sanctum::actingAs($this->user('hr'));
        $this->postJson("/api/leave-requests/{$leave->id}/request-amendment", [
            'reason' => 'Wrong day',
            'leave_type' => 'early',
            'paid' => true,
            'start_date' => $date,
            'end_date' => $date,
            'early_from' => $from,
            'early_to' => $to,
        ])->assertOk();
    }

    private function approve(LeaveRequest $leave)
    {
        Sanctum::actingAs($this->user('depot_manager'));

        return $this->postJson("/api/leave-requests/{$leave->id}/approve-amendment");
    }

    private function user(string $role): User
    {
        return User::create([
            'name' => ucfirst($role).' User',
            'email' => $role.'-'.Str::lower(Str::random(8)).'@example.test',
            'password' => bcrypt('test-only'),
            'role' => $role,
            'is_active' => true,
        ]);
    }
}
