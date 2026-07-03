<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Position extends Model
{
    protected $fillable = [
        'name_en', 'name_ar', 'department_key', 'category', 'level', 'is_active', 'sort',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'sort'      => 'integer',
    ];

    public function employees()
    {
        return $this->hasMany(Employee::class, 'position_id');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }
}
