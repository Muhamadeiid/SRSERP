<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    protected $fillable = [
        'tracking_no', 'user_id', 'employee_id',
        'employee_name', 'job_title', 'department', 'department_label', 'direct_manager_name', 'alternate_employee_name',
        'type',
        // LRF
        'leave_type', 'paid', 'available_balance',
        'request_date', 'start_date', 'end_date', 'days', 'purpose',
        'early_from', 'early_to',
        // OTR
        'ot_date', 'start_time', 'end_time', 'hours', 'explanation', 'overtime_results',
        // Approval
        'status', 'approved_by', 'approved_at', 'balance_deducted_at', 'rejection_reason',
        // Cancellation
        'cancelled_at', 'cancelled_by', 'cancellation_reason',
        // Reschedule
        'rescheduled_at', 'rescheduled_by', 'reschedule_reason',
        // Manager approval
        'manager_approved_by', 'manager_approved_at',
        // HR approval
        'hr_approved_by', 'hr_approved_at',
        // Signatures
        'manager_signature', 'hr_signature', 'depot_signature',
    ];

    protected $casts = [
        'paid'                => 'boolean',
        'request_date'        => 'date',
        'start_date'          => 'date',
        'end_date'            => 'date',
        'ot_date'             => 'date',
        'approved_at'         => 'datetime',
        'hr_approved_at'      => 'datetime',
        'manager_approved_at' => 'datetime',
        'balance_deducted_at' => 'datetime',
        'cancelled_at'        => 'datetime',
        'available_balance'   => 'decimal:2',
        'days'                => 'decimal:2',
        'hours'               => 'float',
    ];

    public function user()           { return $this->belongsTo(User::class); }
    public function employee()       { return $this->belongsTo(Employee::class); }
    public function approver()       { return $this->belongsTo(User::class, 'approved_by'); }
    public function hrApprover()     { return $this->belongsTo(User::class, 'hr_approved_by'); }
    public function canceller()      { return $this->belongsTo(User::class, 'cancelled_by'); }
    public function managerApprover(){ return $this->belongsTo(User::class, 'manager_approved_by'); }
    public function rescheduler()    { return $this->belongsTo(User::class, 'rescheduled_by'); }
}
