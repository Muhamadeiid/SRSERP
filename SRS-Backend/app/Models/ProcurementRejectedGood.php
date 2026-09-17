<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementRejectedGood extends Model
{
    protected $guarded = [];
    protected $casts = [
        'delivery_date' => 'date', 'rejecting_date' => 'date',
        'supplier_acknowledged_at' => 'datetime', 'returned_at' => 'datetime',
    ];
    public function igi() { return $this->belongsTo(IncomingGoodsInspection::class, 'igi_id'); }
    public function requester() { return $this->belongsTo(User::class, 'requester_id'); }
    public function materialController() { return $this->belongsTo(User::class, 'material_controller_id'); }
}
