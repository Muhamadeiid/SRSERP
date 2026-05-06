<?php

namespace App\Models;

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

    // Create a notification for every user that has one of the given roles
    public static function notifyRole(string $role, string $type, string $title, string $body, array $data = []): void
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
        }
    }

    // Create a notification for a specific user
    public static function notifyUser(int $userId, string $type, string $title, string $body, array $data = []): void
    {
        static::create([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'body'    => $body,
            'data'    => $data,
        ]);
    }
}
