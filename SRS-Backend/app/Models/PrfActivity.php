<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrfActivity extends Model
{
    protected $fillable = [
        'prf_id',
        'actor_id',
        'action',
        'changes',
    ];

    protected $casts = [
        'changes' => 'array',
    ];

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
