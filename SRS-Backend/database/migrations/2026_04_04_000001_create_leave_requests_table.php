<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->string('tracking_no')->unique();

            // Who submitted
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('employee_name');
            $table->string('job_title')->nullable();
            $table->string('department')->nullable();
            $table->string('department_label')->nullable();

            // Type: 'lrf' | 'otr'
            $table->enum('type', ['lrf', 'otr'])->default('lrf');

            // LRF fields
            $table->enum('leave_type', ['annual', 'casual', 'sick', 'early'])->nullable();
            $table->boolean('paid')->default(true);
            $table->integer('available_balance')->default(0);
            $table->date('request_date')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->integer('days')->default(0);
            $table->string('purpose')->nullable();
            $table->time('early_from')->nullable();
            $table->time('early_to')->nullable();

            // OTR fields
            $table->date('ot_date')->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->decimal('hours', 5, 1)->nullable();
            $table->text('explanation')->nullable();

            // Approval
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('rejection_reason')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_requests');
    }
};
