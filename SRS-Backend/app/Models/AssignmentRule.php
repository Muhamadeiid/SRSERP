<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentRule extends Model
{
    protected $fillable = ['match_field', 'match_value', 'direct_manager_id', 'department', 'work_location', 'is_active', 'priority'];

    protected $casts = [
        'is_active' => 'boolean',
        'priority'  => 'integer',
    ];

    public function manager()
    {
        return $this->belongsTo(Employee::class, 'direct_manager_id');
    }

    /**
     * Does this rule match the given employee?
     * - department: exact key match
     * - position: case-insensitive substring (so "Intervention" matches
     *   "Intervention Technician")
     */
    public function matches(Employee $emp): bool
    {
        if ($this->match_field === 'department') {
            return $emp->department !== null
                && strcasecmp($emp->department, $this->match_value) === 0;
        }

        // position
        $pos = mb_strtolower($emp->position ?? '');
        return $pos !== '' && str_contains($pos, mb_strtolower($this->match_value));
    }
}
