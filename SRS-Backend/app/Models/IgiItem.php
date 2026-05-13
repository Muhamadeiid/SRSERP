<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IgiItem extends Model
{
    protected $table = 'igi_items';

    protected $fillable = [
        'igi_id',
        'po_item_id',
        'no',
        'description',
        'system',
        'batch_no',
        'qty_received',
        'unit',
        'shelf_life',
        'compliant_po',
        'compliant_technical',
        'compliant_ehs',
        'remarks',
    ];

    protected $casts = [
        'qty_received'       => 'float',
        'shelf_life'         => 'float',
        'compliant_po'       => 'boolean',
        'compliant_technical'=> 'boolean',
        'compliant_ehs'      => 'boolean',
    ];

    public function igi()
    {
        return $this->belongsTo(IncomingGoodsInspection::class);
    }

    public function poItem()
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'po_item_id');
    }
}
