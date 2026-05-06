<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE leave_requests MODIFY COLUMN status ENUM('pending','approved','rejected','cancelled','rescheduled') NOT NULL DEFAULT 'pending'");

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->text('reschedule_reason')->nullable()->after('cancellation_reason');
            $table->timestamp('rescheduled_at')->nullable()->after('reschedule_reason');
            $table->foreignId('rescheduled_by')->nullable()->constrained('users')->after('rescheduled_at');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropForeign(['rescheduled_by']);
            $table->dropColumn(['reschedule_reason', 'rescheduled_at', 'rescheduled_by']);
        });
        DB::statement("ALTER TABLE leave_requests MODIFY COLUMN status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending'");
    }
};
