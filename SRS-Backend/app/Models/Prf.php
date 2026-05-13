<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Prf extends Model
{
    protected $table = 'prfs';

    protected $fillable = [
        'prf_number',
        'requested_by',
        'date',
        'delivery_location',
        'delivery_contact',
        'requester_phone',
        'requester_email',
        'material_category',
        'notes',
        'notes_image',
        'status',
    ];

    protected $casts = [
        'date'              => 'date',
        'material_category' => 'array',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function items()
    {
        return $this->hasMany(PrfItem::class)->orderBy('sn');
    }

    public function approvals()
    {
        return $this->hasMany(PrfApproval::class)->orderBy('acted_at');
    }

    public function purchaseOrder()
    {
        return $this->hasOne(PurchaseOrder::class, 'prf_id');
    }

    public function approvalFor(string $role): ?PrfApproval
    {
        return $this->approvals
            ->where('role', $role)
            ->where('action', 'approved')
            ->sortByDesc('acted_at')
            ->first();
    }

    /**
     * Generate the next PRF number for the given year.
     * Format: PRF-EG1-{YEAR}-{SEQ4}
     */
    public static function generateNumber(?int $year = null): string
    {
        $year = $year ?: (int) date('Y');
        $prefix = "PRF-EG1-{$year}-";

        $last = static::where('prf_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('prf_number');

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
