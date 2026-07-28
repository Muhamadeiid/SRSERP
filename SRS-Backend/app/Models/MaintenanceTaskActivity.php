<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceTaskActivity extends Model
{
    protected $fillable = [
        'maintenance_task_id', 'user_id', 'type', 'body', 'from_status', 'to_status',
    ];

    public function task()
    {
        return $this->belongsTo(MaintenanceTask::class, 'maintenance_task_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
