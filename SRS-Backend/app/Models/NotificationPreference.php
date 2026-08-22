<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationPreference extends Model
{
    public const CATEGORIES = ['crit', 'task', 'meeting', 'hr', 'leave', 'ot', 'report', 'sys'];

    protected $primaryKey = 'user_id';
    public $incrementing = false;

    protected $fillable = [
        'user_id', 'dnd_enabled', 'dnd_until', 'channels',
    ];

    protected $casts = [
        'dnd_enabled' => 'boolean',
        'dnd_until' => 'datetime',
        'channels' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public static function defaultChannels(): array
    {
        return collect(self::CATEGORIES)->mapWithKeys(fn (string $category) => [
            $category => ['in_app' => true, 'email' => false, 'whatsapp' => false],
        ])->all();
    }

    public static function forUser(int $userId): self
    {
        $preference = static::firstOrCreate(
            ['user_id' => $userId],
            ['dnd_enabled' => false, 'channels' => static::defaultChannels()]
        );

        if ($preference->dnd_enabled && $preference->dnd_until && $preference->dnd_until->isPast()) {
            $preference->forceFill(['dnd_enabled' => false, 'dnd_until' => null])->save();
        }

        return $preference;
    }

    public function allowsInApp(string $category): bool
    {
        return (bool) data_get($this->channels ?: static::defaultChannels(), "{$category}.in_app", true);
    }

    public function isDndActive(): bool
    {
        return $this->dnd_enabled && (! $this->dnd_until || $this->dnd_until->isFuture());
    }
}
