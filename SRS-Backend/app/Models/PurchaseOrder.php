<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrder extends Model
{
    protected $table = 'purchase_orders';

    protected $fillable = [
        'po_number',
        'prf_id',
        'created_by',
        'date',
        'category',
        'vendor',
        'tax',
        'withholding_tax',
        'delivery_terms',
        'delivery_period',
        'payment_terms',
        'receipt_location',
        'comments',
        'status',
        'approval_status',
        'sole_supplier',
        'sole_supplier_justification',
        'direct_order',
        'direct_order_reason',
        'budget_plan_id',
        'selected_quotation_id',
        'payment_status',
        'payment_method',
        'payment_reference',
        'paid_at',
        'dispatched_at',
        'dispatched_to',
        'dispatch_reference',
    ];

    protected $casts = [
        'date'            => 'date',
        'tax'             => 'float',
        'withholding_tax' => 'float',
        'sole_supplier'    => 'boolean',
        'direct_order'     => 'boolean',
        'paid_at'         => 'datetime',
        'dispatched_at'   => 'datetime',
    ];

    public function prf()
    {
        return $this->belongsTo(Prf::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items()
    {
        return $this->hasMany(PurchaseOrderItem::class, 'po_id')->orderBy('no');
    }

    public function igi()
    {
        return $this->hasOne(IncomingGoodsInspection::class, 'po_id');
    }

    public function approvals()
    {
        return $this->hasMany(PurchaseOrderApproval::class, 'po_id')->orderBy('acted_at');
    }

    public function selectedQuotation()
    {
        return $this->belongsTo(ProcurementQuotation::class, 'selected_quotation_id');
    }

    public function budgetPlan()
    {
        return $this->belongsTo(ProcurementBudgetPlan::class, 'budget_plan_id');
    }

    public static function generateNumber(?int $year = null): string
    {
        $year   = $year ?: (int) date('Y');
        $prefix = "POF-EG1-{$year}-";

        $last = static::where('po_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('po_number');

        $next = 1;
        if ($last) {
            $tail = substr($last, strlen($prefix));
            if (is_numeric($tail)) {
                $next = ((int) $tail) + 1;
            }
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
