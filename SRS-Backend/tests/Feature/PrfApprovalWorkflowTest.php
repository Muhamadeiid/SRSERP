<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Prf;
use App\Models\PrfApproval;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PrfApprovalWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_prf_moves_through_each_approval_stage_in_order(): void
    {
        $requester = $this->user('staff');
        $materialController = $this->user('material_controller');
        $materialController->update(['e_signature' => 'data:image/png;base64,material-signature-must-not-be-used']);
        $procurement = $this->user('procurement');
        $ehsOfficer = $this->user('ehs');
        $ehs = $this->user('ehs_manager');
        $depot = $this->user('depot_manager');

        Sanctum::actingAs($requester);
        $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kozzika',
            'items' => [['description' => 'Missing category', 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('material_category');

        $prfId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kozzika',
            'material_category' => ['Components and Parts'],
            'items' => [[
                'description' => 'Workflow test item',
                'quantity' => 1,
                'unit' => 'pcs',
            ]],
        ])->assertCreated()->assertJsonPath('data.status', 'pending_material')->json('data.id');

        $this->assertSame(1, $this->unreadFor($materialController, $prfId));
        $this->assertSame(1, $this->unreadFor($procurement, $prfId));
        $this->assertSame(1, $this->unreadFor($ehs, $prfId));
        $this->assertSame(1, $this->unreadFor($depot, $prfId));

        Sanctum::actingAs($ehs);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertForbidden();
        $this->assertSame('pending_material', Prf::findOrFail($prfId)->status);

        Sanctum::actingAs($materialController);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_procurement');
        $this->assertSame(0, $this->unreadFor($materialController, $prfId));
        $this->assertSame(1, $this->unreadFor($procurement, $prfId));

        $this->getJson("/api/procurement/prfs/{$prfId}")
            ->assertOk()
            ->assertJsonPath('data.approvals.0.role', 'material_controller')
            ->assertJsonPath('data.approvals.0.approver.e_signature', null);

        Sanctum::actingAs($procurement);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_ehs');
        $this->assertSame(0, $this->unreadFor($procurement, $prfId));
        $this->assertSame(1, $this->unreadFor($ehs, $prfId));

        Sanctum::actingAs($ehsOfficer);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertForbidden();

        // A repeated click from the previous approver cannot approve the next stage.
        Sanctum::actingAs($procurement);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertForbidden();
        $this->assertSame(2, PrfApproval::where('prf_id', $prfId)->count());

        Sanctum::actingAs($ehs);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_depot');
        $this->assertSame(0, $this->unreadFor($ehs, $prfId));
        $this->assertSame(1, $this->unreadFor($depot, $prfId));

        Sanctum::actingAs($depot);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame(0, $this->unreadFor($depot, $prfId));
        $this->assertSame(4, PrfApproval::where('prf_id', $prfId)->where('action', 'approved')->count());
        $this->assertDatabaseHas('notifications', [
            'user_id' => $requester->id,
            'type' => 'prf_approved',
        ]);

        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertStatus(422);
        $this->assertSame(4, PrfApproval::where('prf_id', $prfId)->count());
    }

    public function test_requester_can_edit_or_cancel_only_before_the_first_approval(): void
    {
        $requester = $this->user('staff');
        $otherUser = $this->user('staff');
        $materialController = $this->user('material_controller');

        Sanctum::actingAs($requester);
        $prfId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Tura workshop',
            'material_category' => ['Safety Equipment'],
            'items' => [['description' => 'Original item', 'quantity' => 1, 'unit' => 'pcs', 'ehs_requirements' => 'SDS']],
        ])->assertCreated()->json('data.id');

        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Ganz depot',
            'material_category' => ['Tools and Equipment'],
            'items' => [['description' => 'Updated item', 'quantity' => 2, 'unit' => 'pcs', 'ehs_requirements' => 'No EHS Required']],
        ])->assertOk()
            ->assertJsonPath('data.delivery_location', 'Ganz depot')
            ->assertJsonPath('data.items.0.description', 'Updated item')
            ->assertJsonPath('data.items.0.ehs_requirements', 'No EHS Required');

        Sanctum::actingAs($otherUser);
        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Katamya',
            'material_category' => ['Others'],
            'items' => [['description' => 'Unauthorized edit', 'quantity' => 1]],
        ])->assertForbidden();

        Sanctum::actingAs($materialController);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")->assertOk();

        Sanctum::actingAs($requester);
        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kozzika',
            'material_category' => ['Components and Parts'],
            'items' => [['description' => 'Too late', 'quantity' => 1]],
        ])->assertForbidden();
        $this->postJson("/api/procurement/prfs/{$prfId}/cancel")->assertForbidden();

        $cancelId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Katamya',
            'material_category' => ['Office Supply / Furniture'],
            'items' => [['description' => 'Cancel me', 'quantity' => 1, 'unit' => 'pcs']],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/procurement/prfs/{$cancelId}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
    }

    public function test_manual_tracking_number_advances_the_next_automatic_number(): void
    {
        $requester = $this->user('staff');
        $procurement = $this->user('procurement');

        Sanctum::actingAs($requester);
        $firstId = $this->postJson('/api/procurement/prfs', [
            'date' => '2026-10-15',
            'delivery_location' => 'Kozzika',
            'material_category' => ['Components and Parts'],
            'items' => [['description' => 'Tracked item', 'quantity' => 1]],
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($procurement);
        $this->putJson("/api/procurement/prfs/{$firstId}/tracking-no", [
            'prf_number' => '123',
        ])->assertOk()->assertJsonPath('data.prf_number', 'PRF-EG1-2026-0123');

        Sanctum::actingAs($requester);
        $this->postJson('/api/procurement/prfs', [
            'date' => '2026-10-15',
            'delivery_location' => 'Kozzika',
            'material_category' => ['Components and Parts'],
            'items' => [['description' => 'Next tracked item', 'quantity' => 1]],
        ])->assertCreated()->assertJsonPath('data.prf_number', 'PRF-EG1-2026-0124');
    }

    private function unreadFor(User $user, int $prfId): int
    {
        return Notification::where('user_id', $user->id)
            ->where('data->prf_id', $prfId)
            ->where('read', false)
            ->count();
    }

    private function user(string $role): User
    {
        $suffix = Str::lower(Str::random(10));

        return User::create([
            'name' => ucfirst($role) . " PRF {$suffix}",
            'email' => "prf-{$role}-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => 'admin',
            'is_active' => true,
        ]);
    }
}
