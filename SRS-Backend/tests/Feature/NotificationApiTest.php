<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_user_only_lists_their_own_visible_notifications_and_can_filter_tabs(): void
    {
        $user = $this->user();
        $other = $this->user();
        $leave = $this->notification($user, 'leave', 'Leave approval');
        $this->notification($user, 'task', 'Assigned task');
        $this->notification($other, 'leave', 'Private notification');
        $dismissed = $this->notification($user, 'leave', 'Dismissed');
        $dismissed->update(['dismissed_at' => now()]);

        Sanctum::actingAs($user);
        $this->getJson('/api/notifications?tab=leave')
            ->assertOk()
            ->assertJsonPath('items.0.id', $leave->id)
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('unreadCount', 2)
            ->assertJsonPath('unread_count', 2);
    }

    public function test_user_cannot_read_or_dismiss_another_users_notification(): void
    {
        $owner = $this->user();
        $outsider = $this->user();
        $notification = $this->notification($owner, 'sys', 'Private');

        Sanctum::actingAs($outsider);
        $this->patchJson("/api/notifications/{$notification->id}/read")->assertNotFound();
        $this->deleteJson("/api/notifications/{$notification->id}")->assertNotFound();
        $this->assertDatabaseHas('notifications', ['id' => $notification->id, 'read' => false, 'dismissed_at' => null]);
    }

    public function test_read_read_all_open_action_and_dismiss_stay_synchronized(): void
    {
        $user = $this->user();
        $first = $this->notification($user, 'sys', 'First');
        $second = $this->notification($user, 'task', 'Second');
        Sanctum::actingAs($user);

        $this->patchJson("/api/notifications/{$first->id}/action", ['action' => 'open'])
            ->assertOk()
            ->assertJsonPath('data.read', true);
        $this->postJson('/api/notifications/read-all')->assertOk()->assertJsonPath('updated', 1);
        $this->deleteJson("/api/notifications/{$second->id}")->assertOk();

        $this->assertDatabaseMissing('notifications', ['id' => $first->id, 'read_at' => null]);
        $this->assertDatabaseMissing('notifications', ['id' => $second->id, 'dismissed_at' => null]);
    }

    public function test_preferences_are_created_with_defaults_and_can_be_updated(): void
    {
        $user = $this->user();
        Sanctum::actingAs($user);

        $this->getJson('/api/notifications/preferences')
            ->assertOk()
            ->assertJsonPath('data.dnd_enabled', false)
            ->assertJsonPath('data.channels.leave.in_app', true);

        $channels = collect(\App\Models\NotificationPreference::defaultChannels())
            ->map(fn ($channel) => array_merge($channel, ['email' => true]))
            ->all();
        $this->putJson('/api/notifications/preferences', [
            'dndEnabled' => true,
            'dndUntil' => now()->addHour()->toISOString(),
            'channels' => $channels,
        ])->assertOk()
            ->assertJsonPath('data.dnd_enabled', true)
            ->assertJsonPath('data.channels.leave.email', true);
    }

    private function user(): User
    {
        $token = Str::lower(Str::random(10));
        return User::create([
            'name' => 'Notification ' . $token,
            'email' => "notification-{$token}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'staff',
            'department' => 'maintenance',
            'is_active' => true,
        ]);
    }

    private function notification(User $user, string $category, string $title): Notification
    {
        return Notification::create([
            'user_id' => $user->id,
            'type' => "test_{$category}_" . Str::random(6),
            'category' => $category,
            'title' => $title,
            'body' => $title,
            'description' => $title,
            'read' => false,
        ]);
    }
}
