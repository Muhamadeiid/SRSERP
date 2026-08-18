<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InterventionShiftPlan extends Model
{
    protected $fillable = ['employee_id', 'shift_date', 'shift', 'created_by'];

    protected $casts = ['shift_date' => 'date'];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
