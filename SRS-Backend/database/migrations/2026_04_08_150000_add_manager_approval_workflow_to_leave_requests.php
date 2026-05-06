<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add manager_approved to ENUM
        DB::statement("
            ALTER TABLE leave_requests
            MODIFY COLUMN status
            ENUM('pending','manager_approved','approved','rejected','cancelled','rescheduled')
            NOT NULL DEFAULT 'pending'
        ");

        Schema::table('leave_requests', function (Blueprint $table) {
            // Direct-manager approval
            $table->foreignId('manager_approved_by')->nullable()->constrained('users')->after('rescheduled_by');
            $table->timestamp('manager_approved_at')->nullable()->after('manager_approved_by');

            // Signatures (base64 PNG stored as text)
            $table->text('manager_signature')->nullable()->after('manager_approved_at');
            $table->text('hr_signature')->nullable()->after('manager_signature');
            $table->text('depot_signature')->nullable()->after('hr_signature');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropForeign(['manager_approved_by']);
            $table->dropColumn(['manager_approved_by','manager_approved_at','manager_signature','hr_signature','depot_signature']);
        });

        DB::statement("
            ALTER TABLE leave_requests
            MODIFY COLUMN status
            ENUM('pending','approved','rejected','cancelled','rescheduled')
            NOT NULL DEFAULT 'pending'
        ");
    }
};
