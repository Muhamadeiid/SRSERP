<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assignment_rules', function (Blueprint $table) {
            if (!Schema::hasColumn('assignment_rules', 'department')) {
                $table->string('department', 50)->nullable()->after('direct_manager_id');
            }

            if (!Schema::hasColumn('assignment_rules', 'work_location')) {
                $table->string('work_location', 100)->nullable()->after('department');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE employees
                MODIFY COLUMN department VARCHAR(50) NOT NULL DEFAULT 'cm_intervention'
            ");

            DB::statement("
                UPDATE employees SET department = CASE department
                    WHEN 'workshop' THEN 'admin'
                    WHEN 'heavy_maintenance' THEN 'cm'
                    WHEN 'intervention' THEN 'cm_intervention'
                    WHEN 'cm' THEN 'cm'
                    WHEN 'hm' THEN 'hm'
                    WHEN 'pm' THEN 'pm'
                    WHEN 'warranty' THEN 'warranty'
                    WHEN 'cm_intervention' THEN 'cm_intervention'
                    WHEN 'admin' THEN 'admin'
                    ELSE 'admin'
                END
            ");

            DB::statement("
                ALTER TABLE employees
                MODIFY COLUMN department ENUM('cm','hm','pm','warranty','cm_intervention','admin')
                NOT NULL DEFAULT 'cm_intervention'
            ");
        }
    }

    public function down(): void
    {
        Schema::table('assignment_rules', function (Blueprint $table) {
            if (Schema::hasColumn('assignment_rules', 'work_location')) {
                $table->dropColumn('work_location');
            }

            if (Schema::hasColumn('assignment_rules', 'department')) {
                $table->dropColumn('department');
            }
        });
    }
};
