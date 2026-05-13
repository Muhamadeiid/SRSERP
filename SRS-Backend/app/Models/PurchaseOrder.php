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
    ];

    protected $casts = [
        'date'            => 'date',
        'tax'             => 'float',
        'withholding_tax' => 'float',
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
