<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('
            ALTER TABLE leave_requests
            MODIFY available_balance DECIMAL(8,2) NULL DEFAULT NULL
        ');
    }

    public function down(): void
    {
        DB::table('leave_requests')
            ->whereNull('available_balance')
            ->update(['available_balance' => 0]);

        DB::statement('
            ALTER TABLE leave_requests
            MODIFY available_balance INT NOT NULL DEFAULT 0
        ');
    }
};
