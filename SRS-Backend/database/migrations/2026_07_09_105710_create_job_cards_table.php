<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_cards', function (Blueprint $table) {
            $table->id();
            $table->string('card_no', 50)->unique();
            $table->enum('maintenance_type', ['cm', 'pm', 'hm']);
            $table->foreignId('equipment_id')->constrained('equipment')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->enum('status', ['open', 'in_progress', 'completed', 'closed'])->default('open');

            // Assigned technician (from employees table)
            $table->foreignId('assigned_to')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('assigned_to_name', 255)->nullable();

            // Reported / created by
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();

            // Dates
            $table->date('reported_date')->nullable();
            $table->datetime('started_at')->nullable();
            $table->datetime('completed_at')->nullable();
            $table->decimal('downtime_hours', 8, 2)->nullable();

            // PM-specific: schedule
            $table->date('scheduled_date')->nullable();
            $table->string('frequency', 50)->nullable();

            // Work done
            $table->text('work_performed')->nullable();
            $table->text('parts_used')->nullable();
            $table->text('root_cause')->nullable();

            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('maintenance_type');
            $table->index('status');
            $table->index('priority');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_cards');
    }
};
