<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Approval alerts are turn-based: only the person who has to act next is
 * notified, their alert clears once the step is done, and the requester hears
 * the outcome rather than every intermediate step.
 */
class ApprovalNotificationPolicyTest extends TestCase
{
    use DatabaseTransactions;

    public function test_each_approver_is_notified_only_on_their_own_turn(): void
    {
        [$manager, $employeeUser, $employee] = $this->employeeWithManager();
        $hr = $this->user('hr');
        $depot = $this->user('depot_manager');
        $admin = $this->user('admin');

        Sanctum::actingAs($employeeUser);
        $id = $this->postJson('/api/leave-requests', $this->overtimePayload($employee))
            ->assertCreated()->json('data.id');

        // Submitted: the direct manager only.
        $this->assertSame(1, $this->unreadFor($manager, $id));
        $this->assertSame(0, $this->countFor($hr, $id));
        $this->assertSame(0, $this->countFor($depot, $id));
        $this->assertSame(0, $this->countFor($admin, $id));

        Sanctum::actingAs($manager);
        $this->postJson("/api/leave-requests/{$id}/manager-approve")->assertOk();

        // HR's turn; the manager's alert is resolved; the employee is not pinged per step.
        $this->assertSame(0, $this->unreadFor($manager, $id));
        $this->assertSame(1, $this->unreadFor($hr, $id));
        $this->assertSame(0, $this->countFor($depot, $id));
        $this->assertSame(0, $this->countFor($employeeUser, $id));
        $this->assertSame(0, $this->countFor($admin, $id));

        Sanctum::actingAs($hr);
        $this->postJson("/api/leave-requests/{$id}/hr-approve")->assertOk();

        $this->assertSame(0, $this->unreadFor($hr, $id));
        $this->assertSame(1, $this->unreadFor($depot, $id));
        $this->assertSame(0, $this->countFor($employeeUser, $id));
        $this->assertSame(0, $this->countFor($admin, $id));

        Sanctum::actingAs($depot);
        $this->postJson("/api/leave-requests/{$id}/approve")->assertOk();

        // Outcome reaches the employee; nobody else gets an FYI copy.
        $this->assertSame(0, $this->unreadFor($depot, $id));
        $this->assertDatabaseHas('notifications', ['user_id' => $employeeUser->id, 'type' => 'otr_approved']);
        $this->assertSame(1, $this->countFor($hr, $id));
        $this->assertSame(0, $this->countFor($admin, $id));
    }

    public function test_withdrawn_request_clears_the_managers_alert_without_telling_depot(): void
    {
        [$manager, $employeeUser, $employee] = $this->employeeWithManager();
        $depot = $this->user('depot_manager');
        $admin = $this->user('admin');

        Sanctum::actingAs($employeeUser);
        $id = $this->postJson('/api/leave-requests', $this->overtimePayload($employee))
            ->assertCreated()->json('data.id');

        $this->postJson("/api/leave-requests/{$id}/cancel")->assertOk();

        $this->assertSame(0, $this->unreadFor($manager, $id));
        $this->assertSame(0, $this->countFor($depot, $id));
        $this->assertSame(0, $this->countFor($admin, $id));
    }

    public function test_inactive_user_manager_falls_back_to_the_active_direct_manager(): void
    {
        [$inactiveManager, $employeeUser, $employee] = $this->employeeWithManager();
        $inactiveManager->update(['is_active' => false]);
        $activeManagerUser = $this->user('manager');
        $managerEmployee = Employee::create([
            'name' => $activeManagerUser->name,
            'position' => 'Section Head',
            'department' => 'admin',
            'category' => 'White Collar',
            'user_id' => $activeManagerUser->id,
        ]);
        $employee->update(['direct_manager_id' => $managerEmployee->id]);

        Sanctum::actingAs($employeeUser);
        $id = $this->postJson('/api/leave-requests', $this->overtimePayload($employee))
            ->assertCreated()->json('data.id');

        $this->assertSame(1, $this->unreadFor($activeManagerUser, $id));
        $this->assertSame(0, $this->countFor($inactiveManager, $id));
    }

    public function test_resolve_for_only_touches_the_given_record(): void
    {
        $user = $this->user('hr');
        Notification::notifyUser($user->id, 'otr_manager_approved', 'A', 'a', ['leave_request_id' => 900001]);
        Notification::notifyUser($user->id, 'otr_manager_approved', 'B', 'b', ['leave_request_id' => 900002]);

        $this->assertSame(1, Notification::resolveFor('leave_request_id', 900001));
        $this->assertSame(0, $this->unreadFor($user, 900001));
        $this->assertSame(1, $this->unreadFor($user, 900002));
    }

    private function countFor(User $user, int $requestId): int
    {
        return Notification::where('user_id', $user->id)->where('data->leave_request_id', $requestId)->count();
    }

    private function unreadFor(User $user, int $requestId): int
    {
        return Notification::where('user_id', $user->id)->where('data->leave_request_id', $requestId)->where('read', false)->count();
    }

    private function overtimePayload(Employee $employee): array
    {
        return [
            'type' => 'otr',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'ot_date' => now()->addDays(3)->toDateString(),
            'start_time' => '17:00',
            'end_time' => '19:00',
            'explanation' => 'Notification policy test',
        ];
    }

    private function employeeWithManager(): array
    {
        $manager = $this->user('manager');
        $employeeUser = $this->user('staff');
        $employee = Employee::create([
            'name' => $employeeUser->name,
            'position' => 'Technician',
            'department' => 'admin',
            'category' => 'White Collar',
            'user_id' => $employeeUser->id,
            'user_manager_id' => $manager->id,
        ]);

        return [$manager, $employeeUser, $employee];
    }

    private function user(string $role): User
    {
        $suffix = Str::lower(Str::random(10));

        return User::create([
            'name' => ucfirst($role) . " Notify {$suffix}",
            'email' => "notify-{$role}-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => 'admin',
            'is_active' => true,
        ]);
    }
}
