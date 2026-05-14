<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE prfs MODIFY COLUMN status ENUM(
            'draft',
            'pending_procurement',
            'pending_ehs',
            'pending_depot',
            'approved',
            'rejected',
            'cancelled'
        ) NOT NULL DEFAULT 'pending_procurement'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE prfs MODIFY COLUMN status ENUM(
            'draft',
            'pending_procurement',
            'pending_ehs',
            'pending_depot',
            'approved',
            'rejected'
        ) NOT NULL DEFAULT 'pending_procurement'");
    }
};
