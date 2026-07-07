<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DisciplinaryCase extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'violation_type',
        'occurrence_no',
        'incident_date',
        'location',
        'reported_by',
        'witnesses',
        'description',
        'employee_statement',
        'action_taken',
        'action_date',
        'status',
        'hr_notes',
        'created_by',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'incident_date' => 'date',
        'action_date' => 'date',
        'approved_at' => 'datetime',
    ];

    protected $appends = ['violation_label', 'action_label'];

    public const WARNING_ACTIONS = ['written_warning', 'final_warning'];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function getViolationLabelAttribute(): string
    {
        $lookup = Lookup::where('type', 'disciplinary_violation')
            ->where('key', $this->violation_type)
            ->first();

        return $lookup?->label_en ?? str_replace('_', ' ', ucfirst($this->violation_type));
    }

    public function getActionLabelAttribute(): string
    {
        return match ($this->action_taken) {
            'verbal_warning' => 'Verbal Warning',
            'written_warning' => 'Written Warning',
            'final_warning' => 'Final Warning',
            'deduction' => 'Deduction',
            'suspension' => 'Suspension',
            'termination_recommendation' => 'Termination Recommendation',
            default => str_replace('_', ' ', ucfirst((string) $this->action_taken)),
        };
    }
}
