<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class JobCard extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'card_no', 'maintenance_type', 'equipment_id',
        'title', 'description', 'priority', 'status',
        'assigned_to', 'assigned_to_name', 'reported_by',
        'reported_date', 'started_at', 'completed_at', 'downtime_hours',
        'scheduled_date', 'frequency',
        'work_performed', 'parts_used', 'root_cause',
        'notes',
    ];

    protected $casts = [
        'reported_date'  => 'date',
        'scheduled_date' => 'date',
        'started_at'     => 'datetime',
        'completed_at'   => 'datetime',
        'downtime_hours' => 'decimal:2',
    ];

    public function equipment()
    {
        return $this->belongsTo(Equipment::class);
    }

    public function assignee()
    {
        return $this->belongsTo(Employee::class, 'assigned_to');
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by');
    }
}
