<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmployeeAsset extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'issuing_department',
        'asset_name',
        'asset_code',
        'asset_category',
        'received_date',
        'return_date',
        'condition',
        'status',
        'notes',
        'created_by',
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

    // ── Scopes ────────────────────────────────────────────────
    public function scopeActive($q)
    {
        return $q->where('status', 'Active');
    }

    public function scopeForEmployee($q, $employeeId)
    {
        return $q->where('employee_id', $employeeId);
    }

    public function scopeByDepartment($q, $dept)
    {
        return $q->where('issuing_department', $dept);
    }
}
