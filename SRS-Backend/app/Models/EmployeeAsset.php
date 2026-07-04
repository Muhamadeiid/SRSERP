<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmployeeAsset extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'issuing_source_id',
        'it_asset_id',
        'issuing_department',   // legacy — kept in sync for older readers
        'asset_name',
        'asset_code',
        'asset_category',
        'received_date',
        'return_date',
        'condition',
        'status',
        'notes',
        'created_by',
        'received_by_user_id',
    ];

    protected $casts = [
        'received_date' => 'date',
        'return_date'   => 'date',
    ];

    // ── Relationships ─────────────────────────────────────────
    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** New canonical source. */
    public function issuingSource()
    {
        return $this->belongsTo(IssuingSource::class, 'issuing_source_id');
    }

    /** Which IT inventory item this asset was pulled from (if any). */
    public function itAsset()
    {
        return $this->belongsTo(ITAsset::class, 'it_asset_id');
    }

    /** User who signed for the returned asset. */
    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    // ── Scopes ────────────────────────────────────────────────
    public function scopeActive($q)
    {
        return $q->where('status', 'Active');
    }

    public function scopeForEmployee($q, $employeeId)
    {
        return $q->where('employee_id', $employeeId);
    }

    /** Filter by an issuing source key (new) or legacy department string. */
    public function scopeByDepartment($q, $dept)
    {
        // If caller passed a source key like 'ehs', match against the FK.
        if (is_numeric($dept)) {
            return $q->where('issuing_source_id', $dept);
        }
        return $q->where(function ($sub) use ($dept) {
            $sub->where('issuing_department', $dept)
                ->orWhereHas('issuingSource', fn ($s) => $s->where('key', $dept));
        });
    }
}
