<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IssuingSource extends Model
{
    protected $fillable = [
        'key', 'label_en', 'label_ar', 'manager_user_id', 'manager_name', 'is_active', 'sort',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'sort'      => 'integer',
    ];

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    /**
     * Display name for the signatory on the clearance form.
     * Prefers the linked user's name, falls back to the free-text override.
     */
    public function signatoryName(): string
    {
        if ($this->manager) return $this->manager->name;
        return $this->manager_name ?: '—';
    }
}
