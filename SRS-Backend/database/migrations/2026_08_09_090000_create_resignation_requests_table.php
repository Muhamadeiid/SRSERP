<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resignation_requests', function (Blueprint $table) {
            $table->id();
            // Keep the resignation audit trail even if an employee is later hard-deleted.
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('tracking_no')->nullable();
            $table->string('status', 30)->default('pending')->index();
            $table->string('full_name');
            $table->string('department', 100)->nullable();
            $table->string('department_label', 100)->nullable();
            $table->string('current_title');
            $table->string('current_title_ar')->nullable();
            $table->date('resignation_date');
            $table->date('last_working_date')->index();
            $table->string('direct_manager_name')->nullable();
            $table->string('depot_manager_name')->nullable();
            $table->string('declaration_name')->nullable();
            $table->string('national_id', 30)->nullable();
            $table->date('declaration_date')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resignation_requests');
    }
};
