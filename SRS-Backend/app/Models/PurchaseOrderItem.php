<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrderItem extends Model
{
    protected $table = 'purchase_order_items';

    protected $fillable = [
        'po_id',
        'prf_item_id',
        'no',
        'item_description',
        'stock',
        'average_con',
        'qty',
        'unit',
        'unit_price',
        'total',
        'remark',
    ];

    protected $casts = [
        'qty'        => 'float',
        'unit_price' => 'float',
        'total'      => 'float',
    ];

    public function po()
    {
        return $this->belongsTo(PurchaseOrder::class, 'po_id');
    }

    public function prfItem()
    {
        return $this->belongsTo(PrfItem::class, 'prf_item_id');
    }
}
