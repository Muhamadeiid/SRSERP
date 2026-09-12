<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReleaseNoteItem extends Model
{
    protected $table = 'release_note_items';

    protected $fillable = [
        'release_note_id',
        'no',
        'code',
        'item_name',
        'unit',
        'qty_requested',
        'qty_released',
        'qty_returned',
        'actual_qty',
        'check_type',
        'receiver_employee_id',
        'receiver_name',
        'receiver_title',
    ];

    protected $casts = [
        'qty_requested' => 'float',
        'qty_released' => 'float',
        'qty_returned' => 'float',
        'actual_qty'   => 'float',
    ];

    public function releaseNote()
    {
        return $this->belongsTo(ReleaseNote::class, 'release_note_id');
    }

    public function receiver()
    {
        return $this->belongsTo(Employee::class, 'receiver_employee_id');
    }
}
