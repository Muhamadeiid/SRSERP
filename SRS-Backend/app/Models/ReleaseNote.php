<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReleaseNote extends Model
{
    protected $table = 'release_notes';

    protected $fillable = [
        'prn_number',
        'date',
        'type',
        'plan_status',
        'over_plan_reason',
        'trainset_asset_name',
        'work_order',
        'requested_by_employee_id',
        'requested_by_name',
        'requested_by_title',
        'requested_by_date',
        'inventory_specialist_employee_id',
        'inventory_specialist_name',
        'inventory_specialist_title',
        'inventory_specialist_date',
        'status',
        'store_remark',
        'decided_at',
        'created_by',
    ];

    protected $casts = [
        'date'                      => 'date',
        'requested_by_date'         => 'date',
        'inventory_specialist_date' => 'date',
        'decided_at'                => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(ReleaseNoteItem::class, 'release_note_id')->orderBy('no');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function requestedBy()
    {
        return $this->belongsTo(Employee::class, 'requested_by_employee_id');
    }

    public function inventorySpecialist()
    {
        return $this->belongsTo(Employee::class, 'inventory_specialist_employee_id');
    }

    public function activities()
    {
        return $this->hasMany(ReleaseNoteActivity::class, 'release_note_id')->orderBy('id');
    }

    /** PRN-EG1-YYYY-0001 — mirrors the IGI / PRF numbering scheme. */
    public static function generateNumber(?int $year = null): string
    {
        $year   = $year ?: (int) date('Y');
        $prefix = "PRN-EG1-{$year}-";

        $last = static::where('prn_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('prn_number');

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
