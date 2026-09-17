<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementQuotation extends Model
{
    protected $guarded = [];
    protected $casts = [
        'received_date' => 'date', 'expiry_date' => 'date', 'price_before_vat' => 'float',
        'vat' => 'float', 'technical_compliant' => 'boolean', 'ehs_compliant' => 'boolean', 'selected' => 'boolean',
    ];
    public function supplier() { return $this->belongsTo(ProcurementSupplier::class, 'supplier_id'); }
    public function prf() { return $this->belongsTo(Prf::class); }
}
