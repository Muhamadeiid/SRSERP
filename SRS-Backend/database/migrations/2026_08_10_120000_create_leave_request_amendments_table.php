<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_request_amendments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason');
            $table->json('original_data');
            $table->json('proposed_data');
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();
            $table->index(['leave_request_id', 'status']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE leave_requests
                MODIFY COLUMN status
                ENUM('pending','manager_approved','hr_approved','approved','cancellation_pending','amendment_pending','rejected','cancelled','rescheduled')
                NOT NULL DEFAULT 'pending'
            ");
        }
    }

    public function down(): void
    {
        DB::table('leave_requests')->where('status', 'amendment_pending')->update(['status' => 'approved']);
        Schema::dropIfExists('leave_request_amendments');

        if (DB::getDriverName() === 'mysql') {
            DB::statement("
                ALTER TABLE leave_requests
                MODIFY COLUMN status
                ENUM('pending','manager_approved','hr_approved','approved','cancellation_pending','rejected','cancelled','rescheduled')
                NOT NULL DEFAULT 'pending'
            ");
        }
    }
};
