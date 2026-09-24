<?php

namespace App\Console\Commands;

use App\Models\CalendarEvent;
use App\Models\LeaveRequest;
use App\Models\MaintenanceTask;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Time-based reminders. Runs every minute from the scheduler.
 *
 * Every schedule in this app (calendar events, overtime shifts) is stored as
 * the local wall-clock time people typed, while the app clock is UTC. All
 * comparisons here therefore use now() in config('srs.local_timezone');
 * comparing against UTC delivered Cairo reminders three hours late.
 *
 * Each reminder fires when its due moment falls inside a short look-back
 * window rather than an exact minute, so a scheduler tick that runs late or
 * is skipped does not lose the reminder. The per-occurrence dedupe key on the
 * notification keeps overlapping windows from sending it twice.
 */
class DispatchNotificationReminders extends Command
{
    protected $signature = 'notifications:dispatch-reminders';

    protected $description = 'Send due calendar, task, overtime, and maintenance reminders without duplicates.';

    /** How far back a missed reminder is still worth sending. */
    private const CATCH_UP_MINUTES = 10;

    public function handle(): int
    {
        $now = now(config('srs.local_timezone'));

        $this->eventReminders($now);
        $this->overtimeReminders($now);

        // Day-level digests: sent on the first tick inside their morning
        // window, then held back by a per-day dedupe key.
        if ($now->between($now->copy()->setTime(8, 0), $now->copy()->setTime(12, 0))) {
            $this->tasksDueTodayDigest($now);
        }
        if ($now->minute === 0 || $now->minute === 30) {
            $this->overdueCalendarTasks($now);
            $this->overdueMaintenanceTasks($now);
        }

        return self::SUCCESS;
    }

    /**
     * Meetings, interviews and timed tasks, each at its own reminder offset
     * (reminder_minutes; 0 = at start time). Considers today and tomorrow so
     * a 1-day-ahead reminder and windows straddling midnight both work.
     */
    private function eventReminders(Carbon $now): void
    {
        $today = $now->copy()->startOfDay();
        $tomorrow = $today->copy()->addDay();

        CalendarEvent::query()
            ->whereIn('type', ['meeting', 'interview', 'task'])
            ->whereNotNull('event_time')
            ->whereNotNull('reminder_minutes')
            ->where('is_all_day', false)
            ->where(fn ($q) => $q->where('type', '!=', 'task')->orWhere('status', '!=', 'done'))
            ->whereDate('event_date', '<=', $tomorrow->toDateString())
            ->where(function ($q) use ($today) {
                $q->where(fn ($single) => $single->where('recurrence_type', 'none')->whereDate('event_date', '>=', $today->toDateString()))
                    ->orWhere(fn ($recurring) => $recurring->where('recurrence_type', '!=', 'none')
                        ->where(fn ($until) => $until->whereNull('recurrence_until')->orWhereDate('recurrence_until', '>=', $today->toDateString())));
            })
            ->with('participants:id,name')
            ->get()
            ->each(function (CalendarEvent $event) use ($now, $today, $tomorrow) {
                foreach ([$today, $tomorrow] as $day) {
                    if (! $this->occursOn($event, $day)) continue;

                    $startsAt = Carbon::parse($day->toDateString() . ' ' . substr((string) $event->event_time, 0, 8), $now->getTimezone());
                    $fireAt = $startsAt->copy()->subMinutes((int) $event->reminder_minutes);
                    if (! $this->isDue($fireAt, $now) || $startsAt->lt($now->copy()->subMinute())) continue;

                    $this->sendEventReminder($event, $day, $startsAt, $now);
                }
            });
    }

    private function sendEventReminder(CalendarEvent $event, Carbon $day, Carbon $startsAt, Carbon $now): void
    {
        $recipients = $event->type === 'task'
            ? $this->taskRecipients($event)
            : $event->participants->pluck('id')->push($event->created_by)->unique();

        $minutes = max(0, (int) round($now->diffInMinutes($startsAt, false)));
        $when = $this->humanLead($minutes);
        $time = $startsAt->format('H:i');
        [$title, $category] = match ($event->type) {
            'task' => [$minutes === 0 ? 'Task due now' : "Task due {$when}", 'task'],
            'interview' => [$minutes === 0 ? 'Interview starting now' : "Interview {$when}", 'hr'],
            default => [$minutes === 0 ? 'Meeting starting now' : "Meeting {$when}", 'meeting'],
        };

        foreach ($recipients as $userId) {
            $this->notifyOnce(
                (int) $userId,
                "calendar_{$event->type}_reminder",
                $title,
                "{$event->title} · {$time}",
                ['calendar_event_id' => $event->id, 'path' => '/calendar?date=' . $day->toDateString() . '&event=' . $event->id],
                $category,
                'warn',
                '/calendar?date=' . $day->toDateString() . '&event=' . $event->id,
                "calendar_reminder:{$event->id}:{$day->toDateString()}"
            );
        }
    }

    /** One morning message per person listing everything due today. */
    private function tasksDueTodayDigest(Carbon $now): void
    {
        $today = $now->toDateString();

        $byUser = [];
        CalendarEvent::query()
            ->where('type', 'task')
            ->where('status', '!=', 'done')
            ->where('recurrence_type', 'none')
            ->whereDate('event_date', $today)
            ->with('participants:id,name')
            ->get()
            ->each(function (CalendarEvent $task) use (&$byUser) {
                foreach ($this->taskRecipients($task) as $userId) {
                    $byUser[$userId][] = $task;
                }
            });

        foreach ($byUser as $userId => $tasks) {
            $count = count($tasks);
            $urgent = collect($tasks)->whereIn('priority', ['high', 'urgent'])->count();
            $names = collect($tasks)->take(3)->pluck('title')->implode(' · ');
            $this->notifyOnce(
                (int) $userId,
                'calendar_tasks_due_today',
                $count === 1 ? '1 task due today' : "{$count} tasks due today",
                $names . ($count > 3 ? ' …' : '') . ($urgent ? " ({$urgent} high priority)" : ''),
                ['path' => '/calendar?date=' . $today],
                'task',
                $urgent ? 'warn' : 'info',
                '/calendar?date=' . $today,
                "calendar_tasks_due_today:{$today}",
                true
            );
        }
    }

    private function overdueCalendarTasks(Carbon $now): void
    {
        $today = $now->toDateString();

        CalendarEvent::query()
            ->where('type', 'task')
            ->where('status', '!=', 'done')
            ->where('recurrence_type', 'none')
            ->whereDate('event_date', '<', $today)
            ->with('participants:id,name')
            ->get()
            ->each(function (CalendarEvent $task) use ($today) {
                $recipients = $this->taskRecipients($task)->push($task->created_by)->unique();
                foreach ($recipients as $userId) {
                    $this->notifyOnce(
                        (int) $userId,
                        'calendar_task_overdue',
                        'Task overdue',
                        "{$task->title} was due on {$task->event_date->format('d M Y')}.",
                        ['calendar_event_id' => $task->id, 'path' => '/calendar?event=' . $task->id],
                        'task',
                        'warn',
                        '/calendar?date=' . $task->event_date->toDateString() . '&event=' . $task->id,
                        "calendar_task_overdue:{$task->id}:{$today}"
                    );
                }
            });
    }

    private function overtimeReminders(Carbon $now): void
    {
        $dates = collect([$now->toDateString(), $now->copy()->addHours(2)->toDateString()])->unique();

        LeaveRequest::query()
            ->where('type', 'otr')
            ->where('status', 'approved')
            ->where(function ($query) use ($dates) {
                foreach ($dates as $date) $query->orWhereDate('ot_date', $date);
            })
            ->whereNotNull('user_id')
            ->get()
            ->each(function (LeaveRequest $request) use ($now) {
                if (! $request->ot_date || ! $request->start_time) return;

                $startsAt = Carbon::parse($request->ot_date->toDateString() . ' ' . substr((string) $request->start_time, 0, 8), $now->getTimezone());
                if (! $this->isDue($startsAt->copy()->subHours(2), $now) || $startsAt->lt($now)) return;

                $this->notifyOnce(
                    (int) $request->user_id,
                    'overtime_shift_reminder',
                    'Overtime starts in 2 hours',
                    "Your approved overtime {$request->tracking_no} starts at " . $startsAt->format('H:i') . '.',
                    ['leave_request_id' => $request->id, 'request_type' => 'otr', 'path' => '/human-resources/overtime'],
                    'ot',
                    'warn',
                    '/human-resources/overtime?request=' . $request->id,
                    "overtime_shift_reminder:leave_request_id:{$request->id}"
                );
            });
    }

    private function overdueMaintenanceTasks(Carbon $now): void
    {
        MaintenanceTask::query()
            ->whereNotIn('status', ['done'])
            ->whereDate('due_date', '<', $now->toDateString())
            ->with('viewers:id,name')
            ->each(function (MaintenanceTask $task) use ($now) {
                $recipients = $task->viewers->pluck('id')->push($task->created_by)->filter()->unique();
                foreach ($recipients as $recipientId) {
                    $this->notifyOnce(
                        (int) $recipientId,
                        'maintenance_task_overdue',
                        'Maintenance task overdue',
                        "{$task->title} was due on {$task->due_date->format('d M Y')}.",
                        ['maintenance_task_id' => $task->id, 'path' => '/maintenance'],
                        'task',
                        'warn',
                        '/maintenance?task=' . $task->id,
                        "maintenance_task_overdue_{$now->toDateString()}:maintenance_task_id:{$task->id}"
                    );
                }
            });
    }

    /** People who actually have to do a task: its assignees, or the creator for a self-task. */
    private function taskRecipients(CalendarEvent $task)
    {
        $assignees = $task->participants
            ->filter(fn ($user) => ($user->pivot->role ?? null) === 'assignee')
            ->pluck('id');

        return $assignees->isNotEmpty() ? $assignees->unique()->values() : collect([$task->created_by]);
    }

    /** True when $fireAt has passed but by no more than the catch-up window. */
    private function isDue(Carbon $fireAt, Carbon $now): bool
    {
        return $fireAt->lte($now) && $fireAt->gt($now->copy()->subMinutes(self::CATCH_UP_MINUTES));
    }

    private function humanLead(int $minutes): string
    {
        if ($minutes >= 1440) return 'tomorrow';
        if ($minutes >= 120) return 'in ' . intdiv($minutes, 60) . ' hours';
        if ($minutes >= 60) return 'in 1 hour';

        return "in {$minutes} min";
    }

    private function occursOn(CalendarEvent $event, Carbon $date): bool
    {
        // Compare calendar dates only — both sides normalised to midnight UTC so
        // the event's stored date and the local day line up regardless of zone.
        $start = Carbon::parse($event->event_date->toDateString());
        $day = Carbon::parse($date->toDateString());
        if ($day->lt($start)) return false;
        if ($event->recurrence_until && $day->gt(Carbon::parse($event->recurrence_until->toDateString()))) return false;

        $interval = max(1, (int) $event->recurrence_interval);

        return match ($event->recurrence_type) {
            'none' => $day->isSameDay($start),
            'daily' => ((int) $start->diffInDays($day)) % $interval === 0,
            'weekly' => ((int) $start->copy()->startOfWeek(Carbon::SUNDAY)->diffInWeeks($day->copy()->startOfWeek(Carbon::SUNDAY))) % $interval === 0
                && collect($event->recurrence_weekdays ?: [$start->dayOfWeek])->contains($day->dayOfWeek),
            'monthly' => $this->monthlyOccurs($start, $day, $interval),
            default => false,
        };
    }

    /**
     * Monthly recurrence occurs on $start->day, or on the last day of the month
     * when $start->day exceeds the target month's length (Jan 31 -> Feb 28/29).
     */
    private function monthlyOccurs(Carbon $start, Carbon $day, int $interval): bool
    {
        if (((int) $start->diffInMonths($day)) % $interval !== 0) return false;
        if ($start->day === $day->day) return true;
        $daysInMonth = $day->copy()->endOfMonth()->day;

        return $start->day > $daysInMonth && $day->day === $daysInMonth;
    }

    /**
     * Reminders are time-critical, so they also go out as push notifications —
     * previously they were in-app only and never reached anyone who did not
     * have the site open at that minute.
     */
    private function notifyOnce(
        int $userId,
        string $type,
        string $title,
        string $body,
        array $data,
        string $category,
        string $priority,
        string $link,
        string $dedupeKey,
        bool $push = true
    ): void {
        Notification::notifyUser($userId, $type, $title, $body, $data, $push, [
            'category' => $category,
            'priority' => $priority,
            'link' => $link,
            'dedupe_key' => $dedupeKey,
            'actions' => [['label' => 'Open', 'style' => 'primary', 'action' => 'open', 'payload' => []]],
        ]);
    }
}
