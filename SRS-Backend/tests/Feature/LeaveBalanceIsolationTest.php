<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeaveBalanceIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_updating_one_employee_balance_does_not_change_another_employee(): void
    {
        $hr = User::create([
            'name' => 'HR Officer',
            'email' => 'balance-isolation@srs.test',
            'password' => bcrypt('test-only'),
            'role' => 'hr',
        ]);
        $first = Employee::create([
            'name' => 'First Employee',
            'position' => 'Technician',
            'department' => 'CM',
            'status' => 'On Site',
        ]);
        $second = Employee::create([
            'name' => 'Second Employee',
            'position' => 'Technician',
            'department' => 'CM',
            'status' => 'On Site',
        ]);
        LeaveBalance::create([
            'employee_id' => $first->id,
            'annual' => 21,
            'annual_remaining' => 21,
            'casual' => 7,
            'casual_remaining' => 7,
            'sick' => 90,
            'early' => 0,
        ]);
        LeaveBalance::create([
            'employee_id' => $second->id,
            'annual' => 21,
            'annual_remaining' => 16,
            'casual' => 7,
            'casual_remaining' => 5,
            'sick' => 90,
            'early' => 0,
        ]);

        $this->actingAs($hr)
            ->putJson("/api/employees/{$first->id}/leave-balance", [
                'annual' => 21,
                'annual_remaining' => 11,
                'casual' => 7,
                'casual_remaining' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('data.employee_id', $first->id);

        $this->assertDatabaseHas('leave_balances', [
            'employee_id' => $first->id,
            'annual_remaining' => 11,
            'casual_remaining' => 2,
        ]);
        $this->assertDatabaseHas('leave_balances', [
            'employee_id' => $second->id,
            'annual_remaining' => 16,
            'casual_remaining' => 5,
        ]);
    }
}
