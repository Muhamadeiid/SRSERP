<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrderApproval extends Model
{
    protected $guarded = [];
    protected $casts = ['acted_at' => 'datetime'];
    public function approver() { return $this->belongsTo(User::class, 'approver_id'); }
}
