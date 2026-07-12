<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Withdrawal extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'withdrawal_no', 'equipment_id', 'withdrawal_date',
        'expected_return_date', 'actual_return_date',
        'reason', 'description', 'status',
        'withdrawn_by', 'notes',
    ];

    protected $casts = [
        'withdrawal_date'      => 'date',
        'expected_return_date'  => 'date',
        'actual_return_date'    => 'date',
    ];

    public function equipment()
    {
        return $this->belongsTo(Equipment::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'withdrawn_by');
    }
}
