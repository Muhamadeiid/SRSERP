<?php

namespace Database\Seeders;

use App\Models\CalendarEvent;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class CalendarEventSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::query()->where('is_active', true)->orderBy('id')->take(8)->get();
        if ($users->isEmpty()) {
            $this->command?->warn('Calendar samples skipped: no active users exist.');
            return;
        }

        $creator = $users->first();
        $manager = $users->firstWhere('role', 'manager') ?? $creator;
        $hr = $users->firstWhere('role', 'hr') ?? $creator;
        $depot = $users->firstWhere('role', 'depot_manager') ?? $creator;
        $staff = $users->firstWhere('role', 'staff') ?? $users->get(1) ?? $creator;
        $today = Carbon::today();

        $samples = [
            ['type' => 'meeting', 'title' => 'Daily operations review', 'date' => $today, 'time' => '09:00', 'dur' => 30, 'by' => $manager, 'with' => [[$staff, 'attendee']], 'repeat' => 'daily', 'until' => $today->copy()->addDays(14)],
            ['type' => 'task', 'title' => 'Submit weekly maintenance status', 'date' => $today->copy()->addDay(), 'time' => '14:00', 'dur' => 60, 'by' => $manager, 'with' => [[$staff, 'assignee']], 'repeat' => 'weekly', 'weekdays' => [4], 'until' => $today->copy()->addMonths(2)],
            ['type' => 'interview', 'title' => 'Electrical technician interview', 'date' => $today->copy()->addDays(2), 'time' => '11:00', 'dur' => 45, 'by' => $hr, 'with' => [[$manager, 'interviewer']], 'notes' => 'Candidate: sample external candidate.'],
            ['type' => 'meeting', 'title' => 'Monthly depot review', 'date' => $today->copy()->addDays(5), 'time' => '10:00', 'dur' => 90, 'by' => $depot, 'with' => [[$manager, 'attendee'], [$hr, 'attendee']], 'repeat' => 'monthly', 'until' => $today->copy()->addMonths(6)],
            ['type' => 'leave', 'title' => 'Annual leave', 'date' => $today->copy()->addDays(7), 'by' => $staff, 'with' => [], 'all_day' => true, 'leave_end' => $today->copy()->addDays(9)],
            ['type' => 'task', 'title' => 'Review open corrective actions', 'date' => $today->copy()->subDay(), 'time' => '15:00', 'dur' => 45, 'by' => $manager, 'with' => [[$staff, 'assignee']]],
            ['type' => 'meeting', 'title' => 'Safety coordination meeting', 'date' => $today->copy()->addDays(3), 'time' => '13:30', 'dur' => 45, 'by' => $creator, 'with' => [[$manager, 'attendee'], [$depot, 'attendee']]],
            ['type' => 'task', 'title' => 'Prepare monthly KPI pack', 'date' => $today->copy()->addDays(10), 'time' => '12:00', 'dur' => 120, 'by' => $manager, 'with' => [[$staff, 'assignee']], 'repeat' => 'monthly', 'until' => $today->copy()->addMonths(4)],
        ];

        foreach ($samples as $sample) {
            $event = CalendarEvent::updateOrCreate(
                ['title' => $sample['title'], 'created_by' => $sample['by']->id],
                [
                    'type' => $sample['type'],
                    'notes' => $sample['notes'] ?? null,
                    'event_date' => $sample['date']->toDateString(),
                    'event_time' => $sample['time'] ?? null,
                    'duration_min' => $sample['dur'] ?? null,
                    'is_all_day' => $sample['all_day'] ?? false,
                    'leave_end_date' => isset($sample['leave_end']) ? $sample['leave_end']->toDateString() : null,
                    'is_done' => false,
                    'recurrence_type' => $sample['repeat'] ?? 'none',
                    'recurrence_interval' => 1,
                    'recurrence_weekdays' => $sample['weekdays'] ?? null,
                    'recurrence_until' => isset($sample['until']) ? $sample['until']->toDateString() : null,
                ]
            );

            $participants = [$sample['by']->id => ['role' => 'attendee']];
            foreach ($sample['with'] as [$user, $role]) {
                $participants[$user->id] = ['role' => $role];
            }
            $event->participants()->sync($participants);
        }
    }
}
