<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceCode extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';
    protected $primaryKey = 'code';
    protected $fillable = ['code', 'name', 'color_hex', 'exclude_from_reminders'];
    protected $casts = ['exclude_from_reminders' => 'boolean'];
}
