<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incident_reports', function (Blueprint $table) {
            $table->id();
            $table->string('report_no')->unique();
            $table->date('report_date')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('classification', ['ethical', 'process_workflow', 'other']);
            $table->string('classification_other')->nullable();
            $table->string('concerned_area_department');
            $table->text('description');
            $table->string('picture_1_path')->nullable();
            $table->string('picture_2_path')->nullable();
            $table->boolean('needs_investigation')->nullable();
            $table->text('investigation_notes')->nullable();
            $table->foreignId('followed_up_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('follow_up_date')->nullable();
            $table->string('case_frequency_severity')->nullable();
            $table->boolean('warning_letter_required')->nullable();
            $table->string('warning_letter_no')->nullable();
            $table->foreignId('hr_generalist_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('hr_signed_at')->nullable();
            $table->foreignId('depot_manager_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('depot_manager_signed_at')->nullable();
            $table->enum('status', ['submitted', 'under_investigation', 'closed'])->default('submitted')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_reports');
    }
};
