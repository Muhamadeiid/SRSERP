<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Lookup extends Model
{
    protected $fillable = ['type', 'key', 'label_en', 'label_ar', 'color', 'sort', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
        'sort'      => 'integer',
    ];

    public function scopeOfType($q, string $type)
    {
        return $q->where('type', $type);
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }
}
