<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IncidentReport extends Model
{
    protected $fillable = [
        'report_no', 'report_date', 'created_by', 'classification', 'classification_other',
        'concerned_area_department', 'description', 'picture_1_path', 'picture_2_path',
        'needs_investigation', 'investigation_notes', 'followed_up_by', 'follow_up_date',
        'case_frequency_severity', 'warning_letter_required', 'warning_letter_no',
        'hr_generalist_id', 'hr_signed_at', 'depot_manager_id', 'depot_manager_signed_at', 'status',
    ];

    protected $casts = [
        'report_date' => 'date',
        'needs_investigation' => 'boolean',
        'follow_up_date' => 'date',
        'warning_letter_required' => 'boolean',
        'hr_signed_at' => 'date',
        'depot_manager_signed_at' => 'date',
    ];

    public function requester(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function followUpUser(): BelongsTo { return $this->belongsTo(User::class, 'followed_up_by'); }
    public function hrGeneralist(): BelongsTo { return $this->belongsTo(User::class, 'hr_generalist_id'); }
    public function depotManager(): BelongsTo { return $this->belongsTo(User::class, 'depot_manager_id'); }
}
