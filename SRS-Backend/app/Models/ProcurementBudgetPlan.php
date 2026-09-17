<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementBudgetPlan extends Model
{
    protected $guarded = [];
    protected $casts = [
        'items' => 'array', 'subtotal' => 'float', 'vat_total' => 'float',
        'withholding_total' => 'float', 'grand_total' => 'float',
        'depot_approved_at' => 'datetime', 'management_approved_at' => 'datetime',
    ];
    public function preparer() { return $this->belongsTo(User::class, 'prepared_by'); }
    public function depotApprover() { return $this->belongsTo(User::class, 'depot_approved_by'); }
    public function managementApprover() { return $this->belongsTo(User::class, 'management_approved_by'); }
}
