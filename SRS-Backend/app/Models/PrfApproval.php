<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrfApproval extends Model
{
    protected $table = 'prf_approvals';

    protected $fillable = [
        'prf_id',
        'role',
        'action',
        'approver_id',
        'comment',
        'acted_at',
    ];

    protected $casts = [
        'acted_at' => 'datetime',
    ];

    public function prf()
    {
        return $this->belongsTo(Prf::class);
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approver_id');
    }
}
