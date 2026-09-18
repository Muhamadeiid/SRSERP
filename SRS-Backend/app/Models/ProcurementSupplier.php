<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementSupplier extends Model
{
    protected $guarded = [];

    protected $casts = [
        'valid_commercial_registration' => 'boolean',
        'valid_tax_registration' => 'boolean',
        'technical_support_available' => 'boolean',
        'timely_competitive_quotations' => 'boolean',
        'clear_payment_lead_time' => 'boolean',
        'clear_warranty_terms' => 'boolean',
        'ehs_compliant' => 'boolean',
        'last_evaluated_at' => 'datetime',
        'next_evaluation_at' => 'datetime',
        'improvement_requested_at' => 'datetime',
        'improvement_due_at' => 'datetime',
        'is_contractor' => 'boolean',
        'ohs_instructions_acknowledged_at' => 'datetime',
    ];

    public function preparer() { return $this->belongsTo(User::class, 'prepared_by'); }
    public function evaluations() { return $this->hasMany(ProcurementVendorEvaluation::class, 'supplier_id')->latest('evaluation_date'); }
}
