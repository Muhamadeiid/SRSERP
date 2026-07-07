<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE leave_requests
            MODIFY COLUMN status
            ENUM('pending','manager_approved','hr_approved','approved','rejected','cancelled','rescheduled')
            NOT NULL DEFAULT 'pending'
        ");

        Schema::table('leave_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('leave_requests', 'hr_approved_by')) {
                $table->foreignId('hr_approved_by')
                    ->nullable()
                    ->after('manager_signature')
                    ->constrained('users')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('leave_requests', 'hr_approved_at')) {
                $table->timestamp('hr_approved_at')->nullable()->after('hr_approved_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            if (Schema::hasColumn('leave_requests', 'hr_approved_by')) {
                $table->dropForeign(['hr_approved_by']);
                $table->dropColumn('hr_approved_by');
            }
            if (Schema::hasColumn('leave_requests', 'hr_approved_at')) {
                $table->dropColumn('hr_approved_at');
            }
        });

        DB::statement("
            ALTER TABLE leave_requests
            MODIFY COLUMN status
            ENUM('pending','manager_approved','approved','rejected','cancelled','rescheduled')
            NOT NULL DEFAULT 'pending'
        ");
    }
};
