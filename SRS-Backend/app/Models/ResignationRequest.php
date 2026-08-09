<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResignationRequest extends Model
{
    protected $fillable = [
        'employee_id', 'created_by', 'approved_by', 'rejected_by', 'tracking_no',
        'status', 'full_name', 'department', 'department_label', 'current_title',
        'current_title_ar', 'resignation_date', 'last_working_date',
        'direct_manager_name', 'depot_manager_name', 'declaration_name',
        'national_id', 'declaration_date', 'approved_at', 'rejected_at', 'rejection_reason',
    ];

    protected $casts = [
        'resignation_date' => 'date',
        'last_working_date' => 'date',
        'declaration_date' => 'date',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function employee() { return $this->belongsTo(Employee::class)->withTrashed(); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function approver() { return $this->belongsTo(User::class, 'approved_by'); }
    public function rejecter() { return $this->belongsTo(User::class, 'rejected_by'); }
}
