<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Fix leave balance defaults:
     *  - Annual: 21 → 14
     *  - Casual:  6 → 7
     * Only updates rows that still carry the old default (never customised).
     */
    public function up(): void
    {
        // Annual: 21 → 14 (old default was 21)
        DB::statement("
            UPDATE leave_balances
            SET annual           = 14,
                annual_remaining = CASE
                    WHEN annual_remaining IS NULL       THEN NULL
                    WHEN annual_remaining >= annual     THEN 14
                    ELSE LEAST(annual_remaining, 14)
                END
            WHERE annual = 21
        ");

        // Casual: 6 → 7 (old default was 6)
        DB::statement("
            UPDATE leave_balances
            SET casual           = 7,
                casual_remaining = CASE
                    WHEN casual_remaining IS NULL       THEN NULL
                    WHEN casual_remaining >= casual     THEN 7
                    ELSE casual_remaining
                END
            WHERE casual = 6
        ");

        // Also fix the column defaults for future rows
        DB::statement("ALTER TABLE leave_balances MODIFY COLUMN annual  SMALLINT UNSIGNED NOT NULL DEFAULT 14");
        DB::statement("ALTER TABLE leave_balances MODIFY COLUMN casual  SMALLINT UNSIGNED NOT NULL DEFAULT 7");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE leave_balances MODIFY COLUMN annual  SMALLINT UNSIGNED NOT NULL DEFAULT 21");
        DB::statement("ALTER TABLE leave_balances MODIFY COLUMN casual  SMALLINT UNSIGNED NOT NULL DEFAULT 6");
    }
};
