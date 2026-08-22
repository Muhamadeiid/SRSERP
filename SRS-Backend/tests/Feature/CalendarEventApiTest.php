<?php

namespace Tests\Feature;

use App\Models\CalendarEvent;
use App\Models\MaintenanceTask;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CalendarEventApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_participants_only_see_events_shared_with_them(): void
    {
        $creator = $this->user('admin');
        $participant = $this->user('staff');
        $outsider = $this->user('staff');

        Sanctum::actingAs($creator);
        $eventId = $this->postJson('/api/calendar/events', $this->eventPayload('meeting', [
            ['user_id' => $participant->id, 'role' => 'attendee'],
        ]))->assertCreated()->json('data.id');

        Sanctum::actingAs($participant);
        $this->getJson('/api/calendar/events?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->assertJsonPath('data.0.id', $eventId)
            ->assertJsonStructure(['meta' => ['nonWorkingDays']]);

        Sanctum::actingAs($outsider);
        $this->getJson('/api/calendar/events?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_manager_can_assign_tasks_only_to_direct_reports(): void
    {
        $manager = $this->user('manager');
        $report = $this->user('staff', $manager->id);
        $outsider = $this->user('staff');
        Sanctum::actingAs($manager);

        $this->postJson('/api/calendar/events', $this->eventPayload('task', [
            ['user_id' => $report->id, 'role' => 'assignee'],
        ]))->assertCreated();

        $this->postJson('/api/calendar/events', $this->eventPayload('task', [
            ['user_id' => $outsider->id, 'role' => 'assignee'],
        ]))->assertForbidden();
    }

    public function test_only_hr_and_admin_can_create_interviews(): void
    {
        Sanctum::actingAs($this->user('staff'));
        $this->postJson('/api/calendar/events', $this->eventPayload('interview'))->assertForbidden();

        Sanctum::actingAs($this->user('hr'));
        $this->postJson('/api/calendar/events', $this->eventPayload('interview'))->assertCreated();
    }

    public function test_recurring_events_expand_and_multiple_events_can_share_a_day(): void
    {
        $user = $this->user('staff');
        Sanctum::actingAs($user);

        $daily = $this->eventPayload('meeting');
        $daily['recurrence_type'] = 'daily';
        $daily['recurrence_until'] = '2026-08-03';
        $this->postJson('/api/calendar/events', $daily)->assertCreated();
        $this->postJson('/api/calendar/events', $this->eventPayload('meeting'))->assertCreated();

        $response = $this->getJson('/api/calendar/events?from=2026-08-01&to=2026-08-03')->assertOk();
        $this->assertCount(4, $response->json('data'));
        $this->assertCount(2, collect($response->json('data'))->where('date', '2026-08-01'));
    }

    public function test_assignee_can_complete_task_but_outsider_cannot_delete_it(): void
    {
        $creator = $this->user('admin');
        $assignee = $this->user('staff');
        $outsider = $this->user('admin');
        Sanctum::actingAs($creator);
        $eventId = $this->postJson('/api/calendar/events', $this->eventPayload('task', [
            ['user_id' => $assignee->id, 'role' => 'assignee'],
        ]))->assertCreated()->json('data.id');

        Sanctum::actingAs($assignee);
        $this->patchJson("/api/calendar/events/{$eventId}/done", ['done' => true])
            ->assertOk()
            ->assertJsonPath('data.isDone', true);

        Sanctum::actingAs($outsider);
        $this->deleteJson("/api/calendar/events/{$eventId}")->assertForbidden();
        $this->assertDatabaseHas('calendar_events', ['id' => $eventId, 'is_done' => true]);
    }

    public function test_visible_maintenance_task_due_dates_are_included_in_work_calendar(): void
    {
        $creator = $this->user('admin');
        $viewer = $this->user('manager');
        $outsider = $this->user('manager');
        $task = MaintenanceTask::create([
            'title' => 'Inspect traction motor bearing',
            'target_department' => 'cm',
            'priority' => 'high',
            'status' => 'pending',
            'due_date' => '2026-08-22',
            'created_by' => $creator->id,
        ]);
        $task->viewers()->sync([$viewer->id]);

        Sanctum::actingAs($viewer);
        $viewerEvents = collect($this->getJson('/api/calendar/events?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->json('data'));
        $this->assertTrue($viewerEvents->contains(fn ($event) =>
            $event['source'] === 'maintenance_task'
            && $event['sourceId'] === $task->id
            && $event['date'] === '2026-08-22'
        ));

        Sanctum::actingAs($outsider);
        $outsiderEvents = collect($this->getJson('/api/calendar/events?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->json('data'));
        $this->assertFalse($outsiderEvents->contains(fn ($event) =>
            ($event['source'] ?? null) === 'maintenance_task' && ($event['sourceId'] ?? null) === $task->id
        ));
    }

    private function eventPayload(string $type, array $participants = []): array
    {
        return [
            'type' => $type,
            'title' => ucfirst($type) . ' test',
            'event_date' => '2026-08-01',
            'event_time' => '09:00',
            'duration_min' => 60,
            'participants' => $participants,
        ];
    }

    private function user(string $role, ?int $managerId = null): User
    {
        $token = Str::lower(Str::random(10));
        return User::create([
            'name' => ucfirst($role) . ' Calendar ' . $token,
            'email' => "calendar-{$token}@example.test",
            'password' => bcrypt('test-only'),
            'role' => $role,
            'department' => 'cm',
            'manager_id' => $managerId,
            'is_active' => true,
        ]);
    }
}
