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

class MyLeaveBalanceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_a_linked_account_sees_only_its_own_remaining_days(): void
    {
        $user = $this->user();
        $mine = $this->employee($user);
        $other = $this->employee();
        $this->balance($mine, 13.5, 4);
        $this->balance($other, 2, 1);

        Sanctum::actingAs($user);
        $this->getJson('/api/my/leave-balance')->assertOk()
            ->assertJsonPath('data.annual_total', 21)
            ->assertJsonPath('data.annual_remaining', 13.5)
            ->assertJsonPath('data.casual_remaining', 4)
            ->assertJsonPath('data.sick_total', 90)
            ->assertJsonMissingPath('data.employee_id')
            ->assertJsonMissingPath('data.reserved_annual_days');

        // Still no access to anyone else's balance
        $this->getJson("/api/employees/{$other->id}/leave-balance")->assertForbidden();
    }

    public function test_requests_waiting_for_approval_come_off_the_remaining_days(): void
    {
        $user = $this->user();
        $employee = $this->employee($user);
        $this->balance($employee, 10, 7);
        LeaveRequest::create([
            'type' => 'lrf',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'leave_type' => 'annual',
            'start_date' => '2096-03-01',
            'end_date' => '2096-03-03',
            'days' => 3,
            'paid' => true,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($user);
        $this->getJson('/api/my/leave-balance')->assertOk()
            ->assertJsonPath('data.annual_remaining', 7)
            ->assertJsonPath('data.pending_days', 3);
    }

    public function test_an_account_without_a_linked_employee_gets_no_balance(): void
    {
        Sanctum::actingAs($this->user());

        $this->getJson('/api/my/leave-balance')->assertOk()->assertJsonPath('data', null);
    }

    private function user(): User
    {
        return User::create([
            'name' => 'Balance Viewer',
            'email' => 'my-balance-'.Str::lower(Str::random(8)).'@example.test',
            'password' => bcrypt('test-only'),
            'role' => 'staff',
            'is_active' => true,
        ]);
    }

    private function employee(?User $user = null): Employee
    {
        $suffix = Str::lower(Str::random(8));

        return Employee::create([
            'ibs_code' => 'BAL-'.$suffix,
            'name' => 'Balance Employee '.$suffix,
            'position' => 'Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
            'user_id' => $user?->id,
        ]);
    }

    private function balance(Employee $employee, float $annualRemaining, float $casualRemaining): void
    {
        LeaveBalance::create([
            'employee_id' => $employee->id,
            'annual' => 21,
            'annual_remaining' => $annualRemaining,
            'casual' => 7,
            'casual_remaining' => $casualRemaining,
            'sick' => 90,
            'early' => 0,
        ]);
    }
}
