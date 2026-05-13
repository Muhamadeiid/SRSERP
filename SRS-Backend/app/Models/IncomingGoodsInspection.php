<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IncomingGoodsInspection extends Model
{
    protected $table = 'incoming_goods_inspections';

    protected $fillable = [
        'igi_number',
        'po_id',
        'created_by',
        'date',
        'supplier_name',
        'delivery_note_no',
        'photos_notes',
        'photos',
        'status',
    ];

    protected $casts = [
        'date'   => 'date',
        'photos' => 'array',
    ];

    public function po()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items()
    {
        return $this->hasMany(IgiItem::class, 'igi_id')->orderBy('no');
    }

    public static function generateNumber(?int $year = null): string
    {
        $year   = $year ?: (int) date('Y');
        $prefix = "IGI-EG1-{$year}-";

        $last = static::where('igi_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('igi_number');

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
