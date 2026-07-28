<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceTask extends Model
{
    protected $fillable = [
        'title', 'description', 'target_department', 'assigned_user_id',
        'equipment_id', 'train_number', 'unit_number', 'car_code',
        'priority', 'status', 'due_date', 'created_by', 'completed_at',
    ];

    protected $casts = [
        'due_date' => 'date',
        'completed_at' => 'datetime',
    ];

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function equipment()
    {
        return $this->belongsTo(Equipment::class);
    }

    public function viewers()
    {
        return $this->belongsToMany(User::class, 'maintenance_task_viewers')->withTimestamps();
    }

    public function activities()
    {
        return $this->hasMany(MaintenanceTaskActivity::class)->latest();
    }
}
