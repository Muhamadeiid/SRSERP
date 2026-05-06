<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'punch_code',
        'timestamp',
        'device_id',
        'source',
        'raw_data',
        'processed',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'raw_data' => 'array',
        'processed' => 'boolean',
    ];

    /**
     * Scope to get unprocessed logs
     */
    public function scopeUnprocessed($query)
    {
        return $query->where('processed', false);
    }

    /**
     * Scope to filter by date
     */
    public function scopeForDate($query, $date)
    {
        return $query->whereDate('timestamp', $date);
    }

    /**
     * Scope to filter by punch code
     */
    public function scopeForPunchCode($query, $punchCode)
    {
        return $query->where('punch_code', $punchCode);
    }
}
