<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScheduleDayMeta extends Model
{
    protected $table = 'schedule_day_meta';
    protected $fillable = ['schedule_date', 'k6', 'k5', 'c_col', 'k19', 'remark'];
    protected $casts = ['schedule_date' => 'date'];
}
