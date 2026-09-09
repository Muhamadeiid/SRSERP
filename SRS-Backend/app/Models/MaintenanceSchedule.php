<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceSchedule extends Model
{
    protected $table = 'maintenance_schedule';
    protected $fillable = ['schedule_date', 'train_id', 'code'];
    protected $casts = ['schedule_date' => 'date'];
}
