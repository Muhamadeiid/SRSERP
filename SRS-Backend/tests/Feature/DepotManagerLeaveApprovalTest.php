<?php

namespace Tests\Feature;

use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepotManagerLeaveApprovalTest extends TestCase
{
    use DatabaseTransactions;

    public function test_depot_manager_can_finalize_a_pending_request_without_forging_skipped_signatures(): void
    {
        $suffix = Str::lower(Str::random(8));
        $depotManager = User::create([
            'name' => 'Approval Test Depot Manager',
            'email' => "depot-approval-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'depot_manager',
            'department' => 'admin',
            'is_active' => true,
            'e_signature' => 'data:image/png;base64,depot-signature',
        ]);
        Sanctum::actingAs($depotManager);

        $leave = LeaveRequest::create([
            'tracking_no' => "LRF-DIRECT-{$suffix}",
            'employee_name' => 'Approval Test Employee',
            'type' => 'lrf',
            'leave_type' => 'annual',
            'paid' => true,
            'start_date' => now()->addWeek()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
            'days' => 1,
            'status' => 'pending',
        ]);

        $this->postJson("/api/leave-requests/{$leave->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.approved_by', $depotManager->id);

        $leave->refresh();
        $this->assertNull($leave->manager_approved_by);
        $this->assertNull($leave->manager_signature);
        $this->assertNull($leave->hr_approved_by);
        $this->assertNull($leave->hr_signature);
        $this->assertSame($depotManager->id, $leave->approved_by);
        $this->assertSame($depotManager->e_signature, $leave->depot_signature);
    }
}
