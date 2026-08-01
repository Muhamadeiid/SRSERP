<?php

namespace App\Models;

use App\Services\PushSender;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = [
        'user_id', 'type', 'title', 'body', 'data', 'read',
    ];

    protected $casts = [
        'data' => 'array',
        'read' => 'boolean',
    ];

    public function user() { return $this->belongsTo(User::class); }

    // Create a notification for every user that has one of the given roles.
    // Set $push=true only when this is an action item that the recipient must handle
    // themselves (approvals waiting on them, tasks assigned to them). Broadcast / audit
    // notifications should stay false to avoid noisy push spam.
    public static function notifyRole(string $role, string $type, string $title, string $body, array $data = [], bool $push = false): void
    {
        $users = User::where('role', $role)->where('is_active', true)->get();
        foreach ($users as $user) {
            static::create([
                'user_id' => $user->id,
                'type'    => $type,
                'title'   => $title,
                'body'    => $body,
                'data'    => $data,
            ]);
            if ($push) {
                PushSender::sendToUser($user->id, $title, $body, $data + ['type' => $type]);
            }
        }
    }

    // Create a notification for a specific user. See notifyRole for $push semantics.
    public static function notifyUser(int $userId, string $type, string $title, string $body, array $data = [], bool $push = false): void
    {
        static::create([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'body'    => $body,
            'data'    => $data,
        ]);
        if ($push) {
            PushSender::sendToUser($userId, $title, $body, $data + ['type' => $type]);
        }
    }
}
