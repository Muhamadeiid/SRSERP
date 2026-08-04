<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->timestamp('requested_cancellation_at')->nullable()->after('cancellation_reason');
            $table->foreignId('requested_cancellation_by')->nullable()->after('requested_cancellation_at')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('cancellation_rejected_at')->nullable()->after('requested_cancellation_by');
            $table->foreignId('cancellation_rejected_by')->nullable()->after('cancellation_rejected_at')
                ->constrained('users')->nullOnDelete();
            $table->text('cancellation_rejection_reason')->nullable()->after('cancellation_rejected_by');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE leave_requests
                MODIFY COLUMN status
                ENUM('pending','manager_approved','hr_approved','approved','cancellation_pending','rejected','cancelled','rescheduled')
                NOT NULL DEFAULT 'pending'
            ");
        }
    }

    public function down(): void
    {
        DB::table('leave_requests')->where('status', 'cancellation_pending')->update(['status' => 'approved']);

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropForeign(['requested_cancellation_by']);
            $table->dropForeign(['cancellation_rejected_by']);
            $table->dropColumn([
                'requested_cancellation_at',
                'requested_cancellation_by',
                'cancellation_rejected_at',
                'cancellation_rejected_by',
                'cancellation_rejection_reason',
            ]);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE leave_requests
                MODIFY COLUMN status
                ENUM('pending','manager_approved','hr_approved','approved','rejected','cancelled','rescheduled')
                NOT NULL DEFAULT 'pending'
            ");
        }
    }
};
