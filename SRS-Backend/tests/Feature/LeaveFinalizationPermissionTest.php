<?php

namespace Tests\Feature;

use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveFinalizationPermissionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_leave_and_overtime_finalization_permissions_are_independent(): void
    {
        $leaveFinalizer = $this->user('manager', 'leave-finalizer');
        $overtimeFinalizer = $this->user('staff', 'overtime-finalizer');
        $this->grant('manager', 'leaves.finalize');
        $this->grant('staff', 'overtime.finalize');

        $leave = $this->request('lrf');
        $overtime = $this->request('otr');

        Sanctum::actingAs($leaveFinalizer);
        $this->postJson("/api/leave-requests/{$leave->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/leave-requests/{$overtime->id}/approve")
            ->assertForbidden();

        Sanctum::actingAs($overtimeFinalizer);
        $this->postJson("/api/leave-requests/{$overtime->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_workflow_access_exposes_finalize_only_for_the_matching_request_type(): void
    {
        $user = $this->user('manager', 'workflow-finalizer');
        $this->grant('manager', 'leaves.finalize');
        $leave = $this->request('lrf');
        $overtime = $this->request('otr');

        Sanctum::actingAs($user);
        $this->getJson("/api/leave-requests/{$leave->id}")
            ->assertOk()
            ->assertJsonPath('data.can_approve_depot', true);
        $this->getJson("/api/leave-requests/{$overtime->id}")
            ->assertForbidden();
    }

    private function user(string $role, string $prefix): User
    {
        $suffix = Str::lower(Str::random(8));
        return User::create([
            'name' => ucfirst($prefix),
            'email' => "{$prefix}-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => 'operations',
            'is_active' => true,
        ]);
    }

    private function grant(string $role, string $permission): void
    {
        DB::table('role_permissions')->updateOrInsert(
            ['role' => $role, 'permission_key' => $permission],
            ['created_at' => now(), 'updated_at' => now()],
        );
    }

    private function request(string $type): LeaveRequest
    {
        $data = [
            'employee_name' => 'Permission Test Employee',
            'type' => $type,
            'status' => 'pending',
            'request_date' => now()->toDateString(),
        ];

        if ($type === 'lrf') {
            $data += [
                'leave_type' => 'annual',
                'paid' => true,
                'start_date' => now()->addWeek()->toDateString(),
                'end_date' => now()->addWeek()->toDateString(),
                'days' => 1,
            ];
        } else {
            $data += [
                'ot_date' => now()->addWeek()->toDateString(),
                'start_time' => '17:00',
                'end_time' => '19:00',
                'hours' => 2,
                'explanation' => 'Permission boundary test',
            ];
        }

        return LeaveRequest::create($data);
    }
}
