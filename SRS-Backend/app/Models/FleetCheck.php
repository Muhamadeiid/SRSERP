<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FleetCheck extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'check_no', 'equipment_id', 'check_type', 'check_date',
        'inspector_id', 'inspector_name', 'status',
        'total_items', 'passed_items', 'failed_items',
        'notes', 'reported_by',
    ];

    protected $casts = [
        'check_date' => 'date',
    ];

    public function equipment()
    {
        return $this->belongsTo(Equipment::class);
    }

    public function inspector()
    {
        return $this->belongsTo(Employee::class, 'inspector_id');
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    public function items()
    {
        return $this->hasMany(FleetCheckItem::class);
    }
}
