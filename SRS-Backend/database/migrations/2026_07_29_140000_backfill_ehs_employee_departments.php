<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('employees')
            ->join('positions', 'positions.id', '=', 'employees.position_id')
            ->whereRaw('LOWER(positions.department_key) = ?', ['ehs'])
            ->where(function ($query) {
                $query->whereNull('employees.department')
                    ->orWhere('employees.department', '')
                    ->orWhereRaw('LOWER(employees.department) = ?', ['admin']);
            })
            ->update(['employees.department' => 'ehs']);

        DB::table('employees')
            ->where(function ($query) {
                $query->whereNull('department')
                    ->orWhere('department', '')
                    ->orWhereRaw('LOWER(department) = ?', ['admin']);
            })
            ->where(function ($query) {
                $query->whereRaw("LOWER(position) REGEXP '(^|[^a-z])(ehs|hse)([^a-z]|$)'")
                    ->orWhereRaw("LOWER(position) LIKE '%safety%'");
            })
            ->update(['department' => 'ehs']);
    }

    public function down(): void
    {
        // Existing department values cannot be reconstructed safely.
    }
};
