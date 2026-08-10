<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveRequestAmendment extends Model
{
    protected $fillable = [
        'leave_request_id', 'requested_by', 'reason', 'original_data',
        'proposed_data', 'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
    ];

    protected $casts = [
        'original_data' => 'array',
        'proposed_data' => 'array',
        'reviewed_at' => 'datetime',
    ];

    public function requester() { return $this->belongsTo(User::class, 'requested_by'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
    public function leaveRequest() { return $this->belongsTo(LeaveRequest::class); }
}
