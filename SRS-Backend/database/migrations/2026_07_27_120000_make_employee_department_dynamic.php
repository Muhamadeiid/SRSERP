<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('employees', 'department')) {
            return;
        }

        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE employees MODIFY COLUMN department VARCHAR(50) NOT NULL DEFAULT 'cm_intervention'"
            );
        }
    }

    public function down(): void
    {
        // Dynamic master-data values cannot be safely converted back to an ENUM.
    }
};
