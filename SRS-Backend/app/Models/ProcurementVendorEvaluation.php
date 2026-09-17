<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementVendorEvaluation extends Model
{
    protected $guarded = [];
    protected $casts = ['evaluation_date' => 'date', 'ratings' => 'array', 'percentage' => 'float'];
    public function supplier() { return $this->belongsTo(ProcurementSupplier::class, 'supplier_id'); }
    public function preparer() { return $this->belongsTo(User::class, 'prepared_by'); }
}
