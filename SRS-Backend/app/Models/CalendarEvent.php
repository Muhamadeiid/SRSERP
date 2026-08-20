<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CalendarEvent extends Model
{
    protected $fillable = [
        'type', 'title', 'notes', 'event_date', 'event_time', 'duration_min',
        'is_all_day', 'leave_end_date', 'created_by', 'is_done',
        'recurrence_type', 'recurrence_interval', 'recurrence_weekdays', 'recurrence_until',
    ];

    protected $casts = [
        'event_date' => 'date',
        'leave_end_date' => 'date',
        'recurrence_until' => 'date',
        'duration_min' => 'integer',
        'is_all_day' => 'boolean',
        'is_done' => 'boolean',
        'recurrence_interval' => 'integer',
        'recurrence_weekdays' => 'array',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'calendar_event_participants', 'event_id', 'user_id')
            ->withPivot('role');
    }
}
