<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PublicHoliday extends Model
{
    protected $fillable = ['date', 'end_date', 'name_en', 'name_ar'];

    protected $casts = [
        'date'     => 'date',
        'end_date' => 'date',
    ];
}
