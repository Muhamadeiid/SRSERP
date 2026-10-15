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
        $procurement = $this->user('procurement');
        $ehs = $this->user('ehs');
        $depot = $this->user('depot_manager');

        Sanctum::actingAs($requester);
        $prfId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kozzika',
            'items' => [[
                'description' => 'Workflow test item',
                'quantity' => 1,
                'unit' => 'pcs',
            ]],
        ])->assertCreated()->assertJsonPath('data.status', 'pending_procurement')->json('data.id');

        $this->assertSame(1, $this->unreadFor($procurement, $prfId));
        $this->assertSame(0, $this->unreadFor($ehs, $prfId));

        Sanctum::actingAs($ehs);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertForbidden();
        $this->assertSame('pending_procurement', Prf::findOrFail($prfId)->status);

        Sanctum::actingAs($procurement);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_ehs');
        $this->assertSame(0, $this->unreadFor($procurement, $prfId));
        $this->assertSame(1, $this->unreadFor($ehs, $prfId));

        // A repeated click from the previous approver cannot approve the next stage.
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertForbidden();
        $this->assertSame(1, PrfApproval::where('prf_id', $prfId)->count());

        Sanctum::actingAs($ehs);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_depot');
        $this->assertSame(0, $this->unreadFor($ehs, $prfId));
        $this->assertSame(1, $this->unreadFor($depot, $prfId));

        Sanctum::actingAs($depot);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame(0, $this->unreadFor($depot, $prfId));
        $this->assertSame(3, PrfApproval::where('prf_id', $prfId)->where('action', 'approved')->count());
        $this->assertDatabaseHas('notifications', [
            'user_id' => $requester->id,
            'type' => 'prf_approved',
        ]);

        $this->postJson("/api/procurement/prfs/{$prfId}/approve")
            ->assertStatus(422);
        $this->assertSame(3, PrfApproval::where('prf_id', $prfId)->count());
    }

    public function test_requester_can_edit_or_cancel_only_before_the_first_approval(): void
    {
        $requester = $this->user('staff');
        $otherUser = $this->user('staff');
        $procurement = $this->user('procurement');

        Sanctum::actingAs($requester);
        $prfId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Tura',
            'items' => [['description' => 'Original item', 'quantity' => 1, 'unit' => 'pcs']],
        ])->assertCreated()->json('data.id');

        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Ganz',
            'items' => [['description' => 'Updated item', 'quantity' => 2, 'unit' => 'pcs']],
        ])->assertOk()
            ->assertJsonPath('data.delivery_location', 'Ganz')
            ->assertJsonPath('data.items.0.description', 'Updated item');

        Sanctum::actingAs($otherUser);
        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kattamya',
            'items' => [['description' => 'Unauthorized edit', 'quantity' => 1]],
        ])->assertForbidden();

        Sanctum::actingAs($procurement);
        $this->postJson("/api/procurement/prfs/{$prfId}/approve")->assertOk();

        Sanctum::actingAs($requester);
        $this->putJson("/api/procurement/prfs/{$prfId}", [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kozzika',
            'items' => [['description' => 'Too late', 'quantity' => 1]],
        ])->assertForbidden();
        $this->postJson("/api/procurement/prfs/{$prfId}/cancel")->assertForbidden();

        $cancelId = $this->postJson('/api/procurement/prfs', [
            'date' => now()->toDateString(),
            'delivery_location' => 'Kattamya',
            'items' => [['description' => 'Cancel me', 'quantity' => 1, 'unit' => 'pcs']],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/procurement/prfs/{$cancelId}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
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
