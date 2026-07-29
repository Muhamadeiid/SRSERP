<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE users MODIFY COLUMN department VARCHAR(50) NOT NULL DEFAULT 'admin'"
        );

        DB::statement('UPDATE users SET department = LOWER(TRIM(department))');
    }

    public function down(): void
    {
        DB::statement(
            "UPDATE users
             SET department = 'admin'
             WHERE department NOT IN ('cm','hm','pm','warranty','cm_intervention','admin')"
        );

        DB::statement(
            "ALTER TABLE users MODIFY COLUMN department
             ENUM('cm','hm','pm','warranty','cm_intervention','admin')
             NOT NULL DEFAULT 'admin'"
        );
    }
};
