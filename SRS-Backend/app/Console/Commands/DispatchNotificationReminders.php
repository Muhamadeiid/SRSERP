<?php

namespace App\Console\Commands;

use App\Models\CalendarEvent;
use App\Models\LeaveRequest;
use App\Models\MaintenanceTask;
use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Console\Command;

class DispatchNotificationReminders extends Command
{
    protected $signature = 'notifications:dispatch-reminders';

    protected $description = 'Send due calendar, overtime, and maintenance reminders without duplicates.';

    public function handle(): int
    {
        $now = now();
        $this->meetingReminders($now);
        $this->overtimeReminders($now);
        // Overdue task alerts have day-granularity: reset "today's dedupe key"
        // rolls at midnight. Running the (expensive JSON-lookup) scan every
        // minute wastes work; once per hour is the same signal to the user
        // and 60× less load on the notifications table.
        if ($now->minute === 0) {
            $this->overdueTaskReminders($now);
        }

        return self::SUCCESS;
    }

    private function meetingReminders(Carbon $now): void
    {
        $from = $now->copy()->addMinutes(14);
        $to = $now->copy()->addMinutes(16);

        // The window may straddle midnight (e.g. cron at 23:45 → from=23:59,
        // to=00:01). Load candidates for both dates and filter in PHP so a
        // meeting scheduled for 00:00 the next day still gets its reminder.
        CalendarEvent::query()
            ->where('type', 'meeting')
            ->whereDate('event_date', '<=', $to->toDateString())
            ->where(function ($query) use ($from) {
                $query->whereNull('recurrence_until')->orWhereDate('recurrence_until', '>=', $from->toDateString());
            })
            ->with('participants:id,name')
            ->get()
            ->filter(fn (CalendarEvent $event) => $this->firesInWindow($event, $from, $to))
            ->each(function (CalendarEvent $event) use ($from) {
                foreach ($event->participants as $participant) {
                    $this->notifyOnce(
                        (int) $participant->id,
                        'calendar_meeting_reminder_' . $from->toDateString(),
                        'Meeting starts in 15 minutes',
                        $event->title,
                        ['calendar_event_id' => $event->id, 'path' => '/calendar'],
                        'meeting',
                        'warn',
                        '/calendar?event=' . $event->id
                    );
                }
            });
    }

    private function overtimeReminders(Carbon $now): void
    {
        $from = $now->copy()->addMinutes(119);
        $to = $now->copy()->addMinutes(121);

        // Window may straddle midnight; include both dates so overtime starting
        // at 00:00 gets its 2-hour reminder when cron runs the previous day.
        $dates = collect([$from->toDateString(), $to->toDateString()])->unique()->values();

        LeaveRequest::query()
            ->where('type', 'otr')
            ->where('status', 'approved')
            ->where(function ($query) use ($dates) {
                foreach ($dates as $date) $query->orWhereDate('ot_date', $date);
            })
            ->whereNotNull('user_id')
            ->get()
            ->filter(function (LeaveRequest $request) use ($from, $to) {
                if (! $request->ot_date || ! $request->start_time) return false;
                $startTime = substr((string) $request->start_time, 0, 8);
                $target = $request->ot_date->copy()->setTimeFromTimeString($startTime);
                return $target->between($from, $to);
            })
            ->each(function (LeaveRequest $request) {
                $this->notifyOnce(
                    (int) $request->user_id,
                    'overtime_shift_reminder',
                    'Overtime starts in 2 hours',
                    "Your approved overtime {$request->tracking_no} starts at " . substr((string) $request->start_time, 0, 5) . '.',
                    ['leave_request_id' => $request->id, 'request_type' => 'otr', 'path' => '/human-resources/overtime'],
                    'ot',
                    'warn',
                    '/human-resources/overtime?request=' . $request->id
                );
            });
    }

    /**
     * A calendar event fires in [$from, $to] if any occurrence date lands in
     * the window when combined with its event_time. Checks both $from and $to
     * dates so windows straddling midnight are handled.
     */
    private function firesInWindow(CalendarEvent $event, Carbon $from, Carbon $to): bool
    {
        $eventTime = substr((string) $event->event_time, 0, 8);
        $candidates = collect([$from, $to])
            ->map(fn (Carbon $c) => $c->copy()->startOfDay())
            ->unique(fn (Carbon $c) => $c->toDateString());
        foreach ($candidates as $day) {
            if (! $this->occursOn($event, $day)) continue;
            $target = $day->copy()->setTimeFromTimeString($eventTime);
            if ($target->between($from, $to)) return true;
        }
        return false;
    }

    private function occursOn(CalendarEvent $event, Carbon $date): bool
    {
        $start = $event->event_date->copy()->startOfDay();
        $day = $date->copy()->startOfDay();
        if ($day->lt($start)) return false;

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
     * when $start->day exceeds the target month's length (Jan 31 → Feb 28/29,
     * Apr 30, etc.). Falls in every $interval'th month.
     */
    private function monthlyOccurs(Carbon $start, Carbon $day, int $interval): bool
    {
        if (((int) $start->diffInMonths($day)) % $interval !== 0) return false;
        if ($start->day === $day->day) return true;
        $daysInMonth = $day->copy()->endOfMonth()->day;
        return $start->day > $daysInMonth && $day->day === $daysInMonth;
    }

    private function overdueTaskReminders(Carbon $now): void
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
                        'maintenance_task_overdue_' . $now->toDateString(),
                        'Maintenance task overdue',
                        "{$task->title} was due on {$task->due_date->format('d M Y')}.",
                        ['maintenance_task_id' => $task->id, 'path' => '/maintenance'],
                        'task',
                        'warn',
                        '/maintenance?task=' . $task->id
                    );
                }
            });
    }

    private function notifyOnce(
        int $userId,
        string $type,
        string $title,
        string $body,
        array $data,
        string $category,
        string $priority,
        string $link
    ): void {
        $entityKey = collect(['calendar_event_id', 'leave_request_id', 'maintenance_task_id'])
            ->first(fn (string $key) => isset($data[$key]));
        $dedupeKey = $entityKey
            ? "{$type}:{$entityKey}:{$data[$entityKey]}"
            : $type;

        Notification::notifyUser($userId, $type, $title, $body, $data, false, [
            'category' => $category,
            'priority' => $priority,
            'link' => $link,
            'dedupe_key' => $dedupeKey,
            'actions' => [['label' => 'Open', 'style' => 'primary', 'action' => 'open', 'payload' => []]],
        ]);
    }
}
