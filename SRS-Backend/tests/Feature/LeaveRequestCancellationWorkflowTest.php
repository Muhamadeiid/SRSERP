<?php

namespace Tests\Feature;

use App\Models\LeaveRequest;
use App\Models\LeaveBalance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveRequestCancellationWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_employee_cancels_a_request_immediately_before_final_approval(): void
    {
        [$employee, $depot] = $this->users();
        $request = $this->overtimeRequest($employee, 'manager_approved');

        Sanctum::actingAs($employee);
        $this->postJson("/api/leave-requests/{$request->id}/cancel", ['reason' => 'No longer needed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $request->refresh();
        $this->assertSame('cancelled', $request->status);
        $this->assertSame($employee->id, $request->cancelled_by);
        $this->assertNull($request->requested_cancellation_at);
    }

    public function test_approved_request_requires_depot_cancellation_approval_and_cannot_be_requested_twice(): void
    {
        [$employee, $depot] = $this->users();
        $request = $this->overtimeRequest($employee, 'approved');

        Sanctum::actingAs($employee);
        $this->postJson("/api/leave-requests/{$request->id}/cancel", ['reason' => 'Plans changed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancellation_pending');

        $request->refresh();
        $this->assertSame('cancellation_pending', $request->status);
        $this->assertSame($employee->id, $request->requested_cancellation_by);
        $this->assertSame('Plans changed', $request->cancellation_reason);
        $this->assertNull($request->cancelled_at);

        $this->postJson("/api/leave-requests/{$request->id}/cancel", ['reason' => 'Duplicate'])
            ->assertStatus(422);

        Sanctum::actingAs($depot);
        $this->postJson("/api/leave-requests/{$request->id}/approve-cancellation")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $request->refresh();
        $this->assertSame('cancelled', $request->status);
        $this->assertSame($depot->id, $request->cancelled_by);
        $this->assertNotNull($request->cancelled_at);
    }

    public function test_rejected_cancellation_returns_request_to_approved(): void
    {
        [$employee, $depot] = $this->users();
        $request = $this->overtimeRequest($employee, 'approved');

        Sanctum::actingAs($employee);
        $this->postJson("/api/leave-requests/{$request->id}/cancel", ['reason' => 'Employee request'])
            ->assertOk();

        Sanctum::actingAs($depot);
        $this->postJson("/api/leave-requests/{$request->id}/reject-cancellation", ['reason' => 'Payroll already closed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $request->refresh();
        $this->assertSame('approved', $request->status);
        $this->assertSame($depot->id, $request->cancellation_rejected_by);
        $this->assertSame('Payroll already closed', $request->cancellation_rejection_reason);
        $this->assertNotNull($request->cancellation_rejected_at);
        $this->assertNull($request->cancelled_at);
    }

    public function test_regular_employee_cannot_decide_a_cancellation_request(): void
    {
        [$employee] = $this->users();
        $other = $this->createUser('staff');
        $request = $this->overtimeRequest($employee, 'cancellation_pending');

        Sanctum::actingAs($other);
        $this->postJson("/api/leave-requests/{$request->id}/approve-cancellation")
            ->assertForbidden();
        $this->postJson("/api/leave-requests/{$request->id}/reject-cancellation", ['reason' => 'No'])
            ->assertForbidden();
    }

    public function test_approved_lrf_restores_an_already_deducted_balance_only_after_cancellation_approval(): void
    {
        [$employeeUser, $depot] = $this->users();
        $suffix = Str::upper(Str::random(10));
        $employee = Employee::create([
            'name' => "Balance Employee {$suffix}",
            'position' => 'Test Position',
            'department' => 'admin',
            'category' => 'White Collar',
            'user_id' => $employeeUser->id,
        ]);
        $balance = LeaveBalance::create([
            'employee_id' => $employee->id,
            'annual' => 21,
            'annual_remaining' => 15,
            'casual' => 7,
            'casual_remaining' => 7,
            'sick' => 90,
            'sick_remaining' => 90,
        ]);
        $request = LeaveRequest::create([
            'tracking_no' => "LRF-CANCEL-{$suffix}",
            'user_id' => $employeeUser->id,
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => now()->subDays(2)->toDateString(),
            'end_date' => now()->subDay()->toDateString(),
            'days' => 2,
            'status' => 'approved',
            'balance_deducted_at' => now(),
        ]);

        Sanctum::actingAs($employeeUser);
        $this->postJson("/api/leave-requests/{$request->id}/cancel", ['reason' => 'Administrative correction'])
            ->assertOk();
        $this->assertSame(15.0, (float) $balance->fresh()->annual_remaining);

        Sanctum::actingAs($depot);
        $this->postJson("/api/leave-requests/{$request->id}/approve-cancellation")
            ->assertOk();
        $this->assertSame(17.0, (float) $balance->fresh()->annual_remaining);
    }

    private function users(): array
    {
        return [$this->createUser('staff'), $this->createUser('depot_manager')];
    }

    private function createUser(string $role): User
    {
        $suffix = Str::lower(Str::random(10));

        return User::create([
            'name' => "Cancellation {$role} {$suffix}",
            'email' => "cancellation-{$role}-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => 'admin',
            'is_active' => true,
        ]);
    }

    private function overtimeRequest(User $employee, string $status): LeaveRequest
    {
        $suffix = Str::upper(Str::random(10));

        return LeaveRequest::create([
            'tracking_no' => "OTR-CANCEL-{$suffix}",
            'user_id' => $employee->id,
            'employee_name' => $employee->name,
            'type' => 'otr',
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'days' => 0,
            'ot_date' => now()->addDay()->toDateString(),
            'start_time' => '17:00',
            'end_time' => '19:00',
            'hours' => 2,
            'status' => $status,
        ]);
    }
}
