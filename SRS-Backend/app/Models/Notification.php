<?php

namespace App\Models;

use App\Services\PushSender;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    public const CATEGORIES = ['crit', 'task', 'meeting', 'hr', 'leave', 'ot', 'report', 'sys'];
    public const PRIORITIES = ['crit', 'warn', 'info'];

    protected $fillable = [
        'user_id', 'type', 'category', 'priority', 'title', 'body', 'description',
        'sender_user_id', 'sender_icon', 'link', 'data', 'meta', 'actions',
        'dedupe_key', 'read', 'read_at', 'dismissed_at',
    ];

    protected $casts = [
        'data' => 'array',
        'meta' => 'array',
        'actions' => 'array',
        'read' => 'boolean',
        'read_at' => 'datetime',
        'dismissed_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Notification $notification) {
            $notification->category ??= static::categoryForType($notification->type);
            $notification->priority ??= static::priorityForType($notification->type);
            $notification->description ??= $notification->body;
            $notification->link ??= $notification->data['path'] ?? null;
            if (! $notification->link && isset($notification->data['leave_request_id'])) {
                $isOvertime = $notification->category === 'ot';
                $notification->link = ($isOvertime ? '/human-resources/overtime?request=' : '/human-resources/leave-requests?request=')
                    . $notification->data['leave_request_id'];
            }

            if ($notification->read && ! $notification->read_at) {
                $notification->read_at = now();
            }
        });
    }

    public static function categoryForType(?string $type): string
    {
        $type = strtolower((string) $type);

        return match (true) {
            str_contains($type, 'overtime'), str_contains($type, 'otr') => 'ot',
            str_contains($type, 'leave'), str_contains($type, 'lrf') => 'leave',
            str_contains($type, 'task'), str_contains($type, 'maintenance') => 'task',
            str_contains($type, 'meeting') => 'meeting',
            str_contains($type, 'resignation'), str_contains($type, 'interview'), str_contains($type, 'employee') => 'hr',
            str_contains($type, 'report'), str_contains($type, 'prf') => 'report',
            str_contains($type, 'incident'), str_contains($type, 'critical'), str_contains($type, 'fault') => 'crit',
            default => 'sys',
        };
    }

    public static function priorityForType(?string $type): string
    {
        $type = strtolower((string) $type);

        $isNewAssignment = str_contains($type, 'assigned')
            || str_contains($type, 'calendar_task_created')
            || str_contains($type, 'calendar_interview_created');

        return str_contains($type, 'reject') || str_contains($type, 'reschedul') || $isNewAssignment
            ? 'warn'
            : 'info';
    }

    public function user() { return $this->belongsTo(User::class); }

    public function sender() { return $this->belongsTo(User::class, 'sender_user_id'); }

    public function scopeVisible($query)
    {
        return $query->whereNull('dismissed_at');
    }

    public function scopeUnread($query)
    {
        return $query->whereNull('read_at')->where('read', false);
    }

    public function markAsRead(): bool
    {
        return $this->forceFill(['read' => true, 'read_at' => $this->read_at ?? now()])->save();
    }

    public function dismiss(): bool
    {
        return $this->forceFill(['dismissed_at' => now()])->save();
    }

    // Create a notification for every user that has one of the given roles.
    // Set $push=true only when this is an action item that the recipient must handle
    // themselves (approvals waiting on them, tasks assigned to them). Broadcast / audit
    // notifications should stay false to avoid noisy push spam.
    // Critical notifications (category='crit' or priority='crit') bypass user in-app and DND
    // preferences — safety alerts must always land.
    public static function notifyRole(string $role, string $type, string $title, string $body, array $data = [], bool $push = false, array $options = []): void
    {
        $users = User::where('role', $role)->where('is_active', true)->get();
        if ($users->isEmpty()) return;

        $category = $options['category'] ?? static::categoryForType($type);
        $priority = $options['priority'] ?? 'info';
        $isCritical = $priority === 'crit' || $category === 'crit';

        // Batch-load preferences once instead of firstOrCreate per user.
        $prefsMap = NotificationPreference::whereIn('user_id', $users->pluck('id'))->get()->keyBy('user_id');

        foreach ($users as $user) {
            $preferences = $prefsMap->get($user->id);
            if (! $isCritical && $preferences && ! $preferences->allowsInApp($category)) continue;

            $notification = static::persist(array_merge([
                'user_id' => $user->id,
                'type'    => $type,
                'title'   => $title,
                'body'    => $body,
                'data'    => $data,
            ], static::notificationOptions($options)));
            if ($notification->wasRecentlyCreated && $push && ($isCritical || ! $preferences || ! $preferences->isDndActive())) {
                PushSender::sendToUser($user->id, $title, $body, $data + ['type' => $type]);
            }
        }
    }

    // Create a notification for a specific user. See notifyRole for $push semantics.
    // Critical notifications bypass user in-app and DND preferences.
    public static function notifyUser(int $userId, string $type, string $title, string $body, array $data = [], bool $push = false, array $options = []): void
    {
        $category = $options['category'] ?? static::categoryForType($type);
        $priority = $options['priority'] ?? 'info';
        $isCritical = $priority === 'crit' || $category === 'crit';

        $preferences = NotificationPreference::whereKey($userId)->first();
        if (! $isCritical && $preferences && ! $preferences->allowsInApp($category)) return;

        $attributes = array_merge([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'body'    => $body,
            'data'    => $data,
        ], static::notificationOptions($options));

        $notification = static::persist($attributes);

        if ($notification->wasRecentlyCreated && $push && ($isCritical || ! $preferences || ! $preferences->isDndActive())) {
            PushSender::sendToUser($userId, $title, $body, $data + ['type' => $type]);
        }
    }

    private static function notificationOptions(array $options): array
    {
        return array_intersect_key($options, array_flip([
            'category', 'priority', 'description', 'sender_user_id', 'sender_icon',
            'link', 'meta', 'actions', 'dedupe_key',
        ]));
    }

    private static function persist(array $attributes): self
    {
        if (! isset($attributes['dedupe_key'])) {
            return static::create($attributes);
        }

        return static::firstOrCreate(
            ['user_id' => $attributes['user_id'], 'dedupe_key' => $attributes['dedupe_key']],
            $attributes
        );
    }
}
