<?php

namespace App\Http\Controllers;

use App\Models\CalendarEvent;
use App\Models\Employee;
use App\Models\MaintenanceTask;
use App\Models\Notification;
use App\Models\PublicHoliday;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CalendarEventController extends Controller
{
    public function users(Request $request): JsonResponse
    {
        $current = $request->user();
        $taskAssignable = collect();
        if (in_array($current->role, ['admin', 'depot_manager'], true)) {
            $taskAssignable = User::query()->where('is_active', true)->pluck('id');
        } elseif ($current->role === 'manager') {
            $taskAssignable = $current->subordinates()->pluck('id')
                ->merge($current->assignedEmployees()->whereNotNull('user_id')->pluck('user_id'))
                ->push($current->id)
                ->unique();
        }

        return response()->json([
            'success' => true,
            'data' => User::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'role', 'department']),
            'meta' => ['taskAssignableUserIds' => $taskAssignable->values()],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
        ]);
        $from = Carbon::parse($validated['from'])->startOfDay();
        $to = Carbon::parse($validated['to'])->endOfDay();
        abort_if($from->diffInDays($to) > 370, 422, 'Calendar range cannot exceed 370 days.');

        $events = $this->visibleQuery($request->user()->id)
            ->whereDate('event_date', '<=', $to)
            ->where(function ($query) use ($from) {
                $query->where(function ($single) use ($from) {
                    $single->where('recurrence_type', 'none')
                        ->where(function ($dates) use ($from) {
                            $dates->whereDate('event_date', '>=', $from)
                                ->orWhereDate('leave_end_date', '>=', $from);
                        });
                })->orWhere(function ($recurring) use ($from) {
                    $recurring->where('recurrence_type', '!=', 'none')
                        ->where(function ($until) use ($from) {
                            $until->whereNull('recurrence_until')
                                ->orWhereDate('recurrence_until', '>=', $from);
                        });
                });
            })
            ->with(['creator:id,name,role', 'participants:id,name,role'])
            ->orderBy('event_date')
            ->orderBy('event_time')
            ->get();

        $occurrences = $events->flatMap(fn (CalendarEvent $event) => $this->occurrences($event, $from, $to));
        $maintenanceTasks = $this->visibleMaintenanceTasks($request->user(), $from, $to)
            ->map(fn (MaintenanceTask $task) => $this->maintenanceTaskResource($task));
        $occurrences = $occurrences
            ->concat($maintenanceTasks)
            ->sortBy(fn (array $event) => $event['date'] . ' ' . ($event['time'] ?? '23:59'))
            ->values();

        return response()->json([
            'success' => true,
            'data' => $occurrences->values(),
            'meta' => $this->calendarMeta($request->user(), $from, $to),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedPayload($request);
        $this->authorizePayload($request->user(), $data);

        $event = DB::transaction(function () use ($request, $data) {
            $participants = $data['participants'] ?? [];
            unset($data['participants']);
            $data['created_by'] = $request->user()->id;
            $event = CalendarEvent::create($data);
            $this->syncParticipants($event, $request->user(), $participants);
            return $event;
        });

        $event->load(['creator:id,name,role', 'participants:id,name,role']);
        $this->notifyEventCreated($event, $request->user());

        return response()->json([
            'success' => true,
            'data' => $this->resource($event),
        ], 201);
    }

    public function update(Request $request, CalendarEvent $calendarEvent): JsonResponse
    {
        abort_unless($calendarEvent->created_by === $request->user()->id || $request->user()->isAdmin(), 403);
        $data = $this->validatedPayload($request, true);
        $merged = array_merge($calendarEvent->only([
            'type', 'title', 'notes', 'event_date', 'event_time', 'duration_min', 'is_all_day',
            'leave_end_date', 'recurrence_type', 'recurrence_interval', 'recurrence_weekdays', 'recurrence_until',
        ]), $data);
        $this->authorizePayload($request->user(), $merged);

        $before = $calendarEvent->only(['title', 'event_date', 'event_time', 'duration_min']);
        DB::transaction(function () use ($request, $calendarEvent, $data) {
            $participantsProvided = array_key_exists('participants', $data);
            $participants = $data['participants'] ?? [];
            unset($data['participants']);
            $calendarEvent->update($data);
            if ($participantsProvided) $this->syncParticipants($calendarEvent, $request->user(), $participants);
        });

        $calendarEvent->refresh()->load(['creator:id,name,role', 'participants:id,name,role']);
        $this->notifyEventUpdated($calendarEvent, $request->user(), $before);

        return response()->json([
            'success' => true,
            'data' => $this->resource($calendarEvent),
        ]);
    }

    public function toggleDone(Request $request, CalendarEvent $calendarEvent): JsonResponse
    {
        $data = $request->validate(['done' => 'required|boolean']);
        abort_unless($calendarEvent->type === 'task', 422, 'Only tasks can be marked done.');
        $isAssignee = $calendarEvent->participants()
            ->where('users.id', $request->user()->id)
            ->wherePivot('role', 'assignee')
            ->exists();
        abort_unless($calendarEvent->created_by === $request->user()->id || $isAssignee, 403);
        $calendarEvent->update(['is_done' => $data['done']]);

        if ($data['done'] && $calendarEvent->created_by !== $request->user()->id) {
            Notification::notifyUser(
                $calendarEvent->created_by,
                'calendar_task_completed',
                'Task completed',
                "{$request->user()->name} completed {$calendarEvent->title}.",
                ['calendar_event_id' => $calendarEvent->id, 'path' => '/calendar'],
                false,
                $this->notificationOptions($calendarEvent, $request->user(), 'task')
            );
        }

        return response()->json(['success' => true, 'data' => $this->resource($calendarEvent->fresh()->load(['creator:id,name,role', 'participants:id,name,role']))]);
    }

    public function destroy(Request $request, CalendarEvent $calendarEvent): JsonResponse
    {
        abort_unless($calendarEvent->created_by === $request->user()->id, 403);
        $calendarEvent->load('participants:id,name,role');
        $recipients = $calendarEvent->participants->pluck('id')->reject(fn ($id) => (int) $id === $request->user()->id);
        $type = $calendarEvent->type;
        $title = $calendarEvent->title;
        $calendarEvent->delete();
        if (in_array($type, ['meeting', 'interview'], true)) {
            foreach ($recipients as $recipientId) {
                Notification::notifyUser(
                    (int) $recipientId,
                    "calendar_{$type}_cancelled",
                    ucfirst($type) . ' cancelled',
                    "{$title} was cancelled by {$request->user()->name}.",
                    ['path' => '/calendar'],
                    false,
                    [
                        'category' => $type === 'meeting' ? 'meeting' : 'hr',
                        'priority' => 'warn',
                        'sender_user_id' => $request->user()->id,
                        'link' => '/calendar',
                    ]
                );
            }
        }
        return response()->json(['success' => true]);
    }

    private function notifyEventCreated(CalendarEvent $event, User $actor): void
    {
        $type = $event->type;
        if (!in_array($type, ['meeting', 'task', 'interview'], true)) return;

        foreach ($event->participants as $participant) {
            if ((int) $participant->id === (int) $actor->id) continue;
            $role = $participant->pivot->role;
            $label = match ($type) {
                'task' => 'New task assigned',
                'interview' => 'Interview scheduled',
                default => 'Meeting invitation',
            };
            $body = "{$actor->name} added {$event->title} on {$event->event_date->format('d M Y')}";
            if ($event->event_time) $body .= ' at ' . substr((string) $event->event_time, 0, 5);
            $body .= '.';

            Notification::notifyUser(
                (int) $participant->id,
                "calendar_{$type}_created",
                $label,
                $body,
                ['calendar_event_id' => $event->id, 'participant_role' => $role, 'path' => '/calendar'],
                in_array($type, ['task', 'interview'], true),
                $this->notificationOptions(
                    $event,
                    $actor,
                    $type,
                    in_array($type, ['task', 'interview'], true) ? 'warn' : 'info'
                )
            );
        }
    }

    private function notifyEventUpdated(CalendarEvent $event, User $actor, array $before): void
    {
        if (!in_array($event->type, ['meeting', 'task', 'interview'], true)) return;
        $changed = collect(['title', 'event_date', 'event_time', 'duration_min'])
            ->contains(fn ($field) => (string) ($before[$field] ?? '') !== (string) $event->{$field});
        if (!$changed) return;

        foreach ($event->participants as $participant) {
            if ((int) $participant->id === (int) $actor->id) continue;
            Notification::notifyUser(
                (int) $participant->id,
                "calendar_{$event->type}_rescheduled",
                ucfirst($event->type) . ' updated',
                "{$actor->name} updated {$event->title}. New schedule: {$event->event_date->format('d M Y')}" . ($event->event_time ? ' at ' . substr((string) $event->event_time, 0, 5) : '') . '.',
                ['calendar_event_id' => $event->id, 'path' => '/calendar'],
                false,
                $this->notificationOptions($event, $actor, $event->type, 'warn')
            );
        }
    }

    private function notificationOptions(CalendarEvent $event, User $actor, string $type, string $priority = 'info'): array
    {
        return [
            'category' => match ($type) {
                'task' => 'task',
                'interview' => 'hr',
                default => 'meeting',
            },
            'priority' => $priority,
            'sender_user_id' => $actor->id,
            'link' => '/calendar?event=' . $event->id,
            'meta' => array_values(array_filter([
                ['kind' => 'tag', 'value' => $event->event_date->format('d M Y')],
                $event->event_time ? ['kind' => 'text', 'value' => substr((string) $event->event_time, 0, 5)] : null,
            ])),
            'actions' => [['label' => 'Open', 'style' => 'primary', 'action' => 'open', 'payload' => []]],
        ];
    }

    public function stats(Request $request): JsonResponse
    {
        $validated = $request->validate(['month' => ['required', 'date_format:Y-m']]);
        $from = Carbon::createFromFormat('Y-m', $validated['month'])->startOfMonth();
        $to = $from->copy()->endOfMonth();
        $today = Carbon::today();
        $events = $this->visibleQuery($request->user()->id)
            ->whereDate('event_date', '<=', $to)
            ->where(function ($q) use ($from) {
                $q->whereNull('recurrence_until')->orWhereDate('recurrence_until', '>=', $from);
            })
            ->with(['creator:id,name,role', 'participants:id,name,role'])
            ->get();
        $occurrences = $events->flatMap(fn ($event) => $this->occurrences($event, $from, $to));

        $meetings = $occurrences->where('type', 'meeting');
        $tasks = $occurrences->where('type', 'task')->where('isDone', false);
        $interviews = $occurrences->where('type', 'interview');
        $leaveDays = $occurrences->where('type', 'leave')->pluck('date')->unique()->count();
        $employee = Employee::query()->where('user_id', $request->user()->id)->with('leaveBalance')->first();

        return response()->json(['success' => true, 'data' => [
            'meetingsThisMonth' => $meetings->count(),
            'meetingsToday' => $meetings->where('date', $today->toDateString())->count(),
            'tasksPending' => $tasks->count(),
            'tasksOverdue' => $tasks->filter(fn ($event) => $event['date'] < $today->toDateString())->count(),
            'interviewsScheduled' => $interviews->count(),
            'interviewsThisWeek' => $interviews->filter(fn ($event) => Carbon::parse($event['date'])->betweenIncluded($today, $today->copy()->addDays(7)))->count(),
            'leaveDaysThisMonth' => $leaveDays,
            'leaveBalance' => $employee?->leaveBalance?->getEffectiveRemaining('annual'),
        ]]);
    }

    private function visibleQuery(int $userId)
    {
        return CalendarEvent::query()->where(function ($query) use ($userId) {
            $query->where('created_by', $userId)
                ->orWhereHas('participants', fn ($participants) => $participants->where('users.id', $userId));
        });
    }

    private function visibleMaintenanceTasks(User $user, Carbon $from, Carbon $to): Collection
    {
        $query = MaintenanceTask::query()
            ->whereNotNull('due_date')
            ->whereBetween('due_date', [$from->toDateString(), $to->toDateString()])
            ->with(['creator:id,name,role', 'viewers:id,name,role']);

        if (!in_array($user->role, ['admin', 'depot_manager'], true)) {
            $query->whereHas('viewers', fn ($viewers) => $viewers->where('users.id', $user->id));
        }

        return $query->orderBy('due_date')->get();
    }

    private function maintenanceTaskResource(MaintenanceTask $task): array
    {
        return [
            'id' => 'maintenance-' . $task->id,
            'occurrenceKey' => 'maintenance:' . $task->id,
            'source' => 'maintenance_task',
            'sourceId' => $task->id,
            'href' => '/maintenance?task=' . $task->id,
            'type' => 'task',
            'title' => $task->title,
            'date' => $task->due_date->toDateString(),
            'startsOn' => $task->due_date->toDateString(),
            'time' => null,
            'dur' => null,
            'isAllDay' => true,
            'leaveEnd' => null,
            'by' => $task->creator ? [
                'id' => $task->creator->id,
                'name' => $task->creator->name,
                'role' => $task->creator->role,
            ] : null,
            'participants' => $task->viewers->map(fn (User $viewer) => [
                'id' => $viewer->id,
                'name' => $viewer->name,
                'role' => $viewer->role,
            ])->values(),
            'note' => $task->description,
            'isDone' => $task->status === 'done',
            'priority' => $task->priority,
            'recurrence' => ['type' => 'none', 'interval' => 1, 'weekdays' => [], 'until' => null],
        ];
    }

    private function calendarMeta(User $user, Carbon $from, Carbon $to): array
    {
        $employee = Employee::query()->where('user_id', $user->id)->first();
        $holidays = PublicHoliday::query()
            ->whereDate('date', '<=', $to)
            ->where(function ($query) use ($from) {
                $query->whereNull('end_date')->whereDate('date', '>=', $from)
                    ->orWhereDate('end_date', '>=', $from);
            })
            ->get();

        $nonWorkingDays = collect(CarbonPeriod::create($from->copy()->startOfDay(), $to->copy()->startOfDay()))
            ->map(function (Carbon $date) use ($employee, $holidays) {
                $holiday = $holidays->first(function (PublicHoliday $item) use ($date) {
                    $end = $item->end_date ?? $item->date;
                    return $date->betweenIncluded($item->date, $end);
                });
                if ($holiday) {
                    return [
                        'date' => $date->toDateString(),
                        'type' => 'public_holiday',
                        'label' => $holiday->name_en,
                        'labelAr' => $holiday->name_ar,
                    ];
                }
                if ($date->isFriday()) {
                    return [
                        'date' => $date->toDateString(),
                        'type' => 'weekend',
                        'label' => 'Friday',
                        'labelAr' => 'الجمعة',
                    ];
                }
                if ($employee && !$employee->isWorkingDay($date)) {
                    return [
                        'date' => $date->toDateString(),
                        'type' => 'weekly_off',
                        'label' => 'Weekly Off',
                        'labelAr' => 'راحة أسبوعية',
                    ];
                }
                return null;
            })
            ->filter()
            ->values();

        return ['nonWorkingDays' => $nonWorkingDays];
    }

    private function validatedPayload(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'type' => [$required, Rule::in(['meeting', 'task', 'interview', 'leave'])],
            'title' => [$required, 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:10000'],
            'event_date' => [$required, 'date'],
            'event_time' => ['nullable', 'date_format:H:i'],
            'duration_min' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'is_all_day' => ['sometimes', 'boolean'],
            'leave_end_date' => ['nullable', 'date', 'after_or_equal:event_date'],
            'participants' => ['sometimes', 'array', 'max:100'],
            'participants.*.user_id' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'participants.*.role' => ['sometimes', Rule::in(['attendee', 'assignee', 'interviewer', 'candidate', 'notifier'])],
            'recurrence_type' => ['sometimes', Rule::in(['none', 'daily', 'weekly', 'monthly'])],
            'recurrence_interval' => ['sometimes', 'integer', 'min:1', 'max:52'],
            'recurrence_weekdays' => ['nullable', 'array', 'max:7'],
            'recurrence_weekdays.*' => ['integer', 'between:0,6', 'distinct'],
            'recurrence_until' => ['nullable', 'date', 'after_or_equal:event_date'],
        ]);
    }

    private function authorizePayload(User $user, array $data): void
    {
        $type = $data['type'];
        $participants = collect($data['participants'] ?? []);

        if ($type === 'task') {
            abort_unless(in_array($user->role, ['admin', 'depot_manager', 'manager'], true), 403);
            if ($user->role === 'manager') {
                $allowed = $user->subordinates()->pluck('id')
                    ->merge($user->assignedEmployees()->whereNotNull('user_id')->pluck('user_id'))
                    ->push($user->id)->unique();
                abort_unless($participants->pluck('user_id')->diff($allowed)->isEmpty(), 403, 'Managers can assign tasks only to their direct reports.');
            }
        }
        if ($type === 'interview') abort_unless(in_array($user->role, ['admin', 'hr'], true), 403);
        if ($type === 'leave') abort_unless($participants->isEmpty() || $participants->pluck('user_id')->unique()->all() === [$user->id], 403, 'Leave can only be created for your own calendar.');
    }

    private function syncParticipants(CalendarEvent $event, User $creator, array $participants): void
    {
        $rows = [$creator->id => ['role' => 'attendee']];
        foreach ($participants as $participant) {
            $rows[(int) $participant['user_id']] = ['role' => $participant['role'] ?? $this->defaultParticipantRole($event->type)];
        }
        $event->participants()->sync($rows);
    }

    private function defaultParticipantRole(string $type): string
    {
        return match ($type) {
            'task' => 'assignee',
            'interview' => 'interviewer',
            default => 'attendee',
        };
    }

    private function occurrences(CalendarEvent $event, Carbon $from, Carbon $to): Collection
    {
        if ($event->type === 'leave' && $event->recurrence_type === 'none') {
            $start = $event->event_date->copy()->max($from->copy());
            $end = ($event->leave_end_date ?? $event->event_date)->copy()->min($to->copy());
            if ($start->gt($end)) return collect();
            return collect(CarbonPeriod::create($start, $end))->map(fn ($date) => $this->resource($event, $date));
        }

        $dates = collect();
        $cursor = $event->event_date->copy();
        $last = $event->recurrence_until ? $event->recurrence_until->copy()->min($to->copy()) : $to->copy();
        if ($event->recurrence_type === 'none') {
            if ($cursor->betweenIncluded($from, $to)) $dates->push($cursor);
            return $dates->map(fn ($date) => $this->resource($event, $date));
        }

        $interval = max(1, (int) $event->recurrence_interval);
        if ($event->recurrence_type === 'daily') {
            while ($cursor->lte($last)) {
                if ($cursor->gte($from)) $dates->push($cursor->copy());
                $cursor->addDays($interval);
            }
        } elseif ($event->recurrence_type === 'weekly') {
            $weekdays = collect($event->recurrence_weekdays ?: [$event->event_date->dayOfWeek])->map(fn ($day) => (int) $day);
            foreach (CarbonPeriod::create($cursor->copy()->max($from->copy()), $last) as $date) {
                $weeks = $event->event_date->copy()->startOfWeek(Carbon::SUNDAY)->diffInWeeks($date->copy()->startOfWeek(Carbon::SUNDAY));
                if ($weeks % $interval === 0 && $weekdays->contains($date->dayOfWeek)) $dates->push($date->copy());
            }
        } else {
            while ($cursor->lte($last)) {
                if ($cursor->gte($from)) $dates->push($cursor->copy());
                $cursor->addMonthsNoOverflow($interval);
            }
        }

        return $dates->map(fn ($date) => $this->resource($event, $date));
    }

    private function resource(CalendarEvent $event, ?Carbon $occurrenceDate = null): array
    {
        return [
            'id' => $event->id,
            'occurrenceKey' => $event->id . ':' . ($occurrenceDate ?? $event->event_date)->toDateString(),
            'type' => $event->type,
            'title' => $event->title,
            'date' => ($occurrenceDate ?? $event->event_date)->toDateString(),
            'startsOn' => $event->event_date->toDateString(),
            'time' => $event->event_time ? substr((string) $event->event_time, 0, 5) : null,
            'dur' => $event->duration_min,
            'isAllDay' => $event->is_all_day,
            'leaveEnd' => $event->leave_end_date?->toDateString(),
            'by' => $event->creator ? ['id' => $event->creator->id, 'name' => $event->creator->name, 'role' => $event->creator->role] : null,
            'participants' => $event->participants->map(fn ($user) => ['id' => $user->id, 'name' => $user->name, 'role' => $user->pivot->role])->values(),
            'note' => $event->notes,
            'isDone' => $event->is_done,
            'recurrence' => [
                'type' => $event->recurrence_type,
                'interval' => $event->recurrence_interval,
                'weekdays' => $event->recurrence_weekdays,
                'until' => $event->recurrence_until?->toDateString(),
            ],
        ];
    }
}
