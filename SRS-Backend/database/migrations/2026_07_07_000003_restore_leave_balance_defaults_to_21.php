<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            UPDATE leave_balances
            SET annual_remaining = CASE
                    WHEN annual_remaining IS NULL THEN NULL
                    ELSE annual_remaining + 7
                END,
                annual = 21
            WHERE annual = 14
        ");

        DB::statement("
            ALTER TABLE leave_balances
            MODIFY annual DECIMAL(8,2) NOT NULL DEFAULT 21,
            MODIFY casual DECIMAL(8,2) NOT NULL DEFAULT 7
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE leave_balances
            MODIFY annual DECIMAL(8,2) NOT NULL DEFAULT 14,
            MODIFY casual DECIMAL(8,2) NOT NULL DEFAULT 7
        ");
    }
};
