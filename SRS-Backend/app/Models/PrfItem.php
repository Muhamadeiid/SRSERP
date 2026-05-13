<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrfItem extends Model
{
    protected $table = 'prf_items';

    protected $fillable = [
        'prf_id',
        'sn',
        'description',
        'technical_specifications',
        'quantity',
        'unit',
        'ehs_requirements',
        'required_by_date',
    ];

    protected $casts = [
        'quantity'         => 'float',
        'required_by_date' => 'date',
    ];

    public function prf()
    {
        return $this->belongsTo(Prf::class);
    }
}
