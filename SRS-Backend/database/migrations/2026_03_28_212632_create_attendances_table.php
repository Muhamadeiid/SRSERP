<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->onDelete('cascade');
            $table->date('date');
            $table->time('check_in')->nullable();
            $table->time('check_out')->nullable();
            $table->decimal('work_hours', 5, 2)->nullable(); // Calculated
            $table->decimal('expected_hours', 5, 2)->default(8.00); // From shift
            $table->integer('late_minutes')->default(0);
            $table->decimal('overtime_hours', 5, 2)->default(0.00);
            $table->enum('status', [
                'present',
                'absent',
                'late',
                'wfh',
                'intervention',
                'incomplete',
                'shortage'
            ])->default('absent');
            $table->boolean('is_manual')->default(false); // True if admin entered manually
            $table->foreignId('created_by')->nullable()->constrained('users'); // Admin who created
            $table->text('notes')->nullable();
            $table->timestamps();

            // Unique constraint: one attendance record per employee per day
            $table->unique(['employee_id', 'date']);

            // Indexes for performance
            $table->index('date');
            $table->index('status');
            $table->index(['employee_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
