<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    protected $fillable = [
        'tracking_no', 'user_id', 'employee_id',
        'employee_name', 'job_title', 'department', 'department_label', 'direct_manager_name',
        'alternate_employee_id', 'alternate_employee_name',
        'type',
        // LRF
        'leave_type', 'paid', 'company_paid', 'available_balance', 'casual_available_balance',
        'request_date', 'start_date', 'end_date', 'days', 'purpose', 'company_paid_purpose',
        'medical_attachment_path', 'medical_attachment_name', 'medical_attachment_mime',
        'early_from', 'early_to',
        // OTR
        'ot_date', 'start_time', 'end_time', 'hours', 'explanation', 'overtime_results',
        // Approval
        'status', 'approved_by', 'approved_at', 'balance_deducted_at', 'rejection_reason',
        'rejected_by', 'rejected_at',
        // Cancellation
        'cancelled_at', 'cancelled_by', 'cancellation_reason',
        'requested_cancellation_at', 'requested_cancellation_by',
        'cancellation_rejected_at', 'cancellation_rejected_by', 'cancellation_rejection_reason',
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
        'company_paid'        => 'boolean',
        'request_date'        => 'date',
        'start_date'          => 'date',
        'end_date'            => 'date',
        'ot_date'             => 'date',
        'approved_at'         => 'datetime',
        'hr_approved_at'      => 'datetime',
        'manager_approved_at' => 'datetime',
        'balance_deducted_at' => 'datetime',
        'rejected_at'         => 'datetime',
        'cancelled_at'        => 'datetime',
        'requested_cancellation_at' => 'datetime',
        'cancellation_rejected_at' => 'datetime',
        'available_balance'   => 'decimal:2',
        'casual_available_balance' => 'decimal:2',
        'days'                => 'decimal:2',
        'hours'               => 'float',
    ];

    protected $hidden = ['medical_attachment_path'];

    public function user()           { return $this->belongsTo(User::class); }
    public function employee()       { return $this->belongsTo(Employee::class); }
    public function alternateEmployee(){ return $this->belongsTo(Employee::class, 'alternate_employee_id')->withTrashed(); }
    public function approver()       { return $this->belongsTo(User::class, 'approved_by'); }
    public function rejecter()       { return $this->belongsTo(User::class, 'rejected_by'); }
    public function hrApprover()     { return $this->belongsTo(User::class, 'hr_approved_by'); }
    public function canceller()      { return $this->belongsTo(User::class, 'cancelled_by'); }
    public function cancellationRequester(){ return $this->belongsTo(User::class, 'requested_cancellation_by'); }
    public function cancellationRejecter(){ return $this->belongsTo(User::class, 'cancellation_rejected_by'); }
    public function managerApprover(){ return $this->belongsTo(User::class, 'manager_approved_by'); }
    public function rescheduler()    { return $this->belongsTo(User::class, 'rescheduled_by'); }
    public function amendments()     { return $this->hasMany(LeaveRequestAmendment::class)->latest(); }
    public function pendingAmendment(){ return $this->hasOne(LeaveRequestAmendment::class)->where('status', 'pending')->latestOfMany(); }
}
