<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A persistent trail of every clearance form that gets generated.
     * Backs the ECF-XXX-NNN tracking number counter and lets HR see who
     * cleared an employee, when, and with which assets outstanding.
     */
    public function up(): void
    {
        Schema::create('clearance_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('tracking_no', 40)->unique();
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('active_assets_at_generation')->default(0);
            $table->timestamps();

            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clearance_reports');
    }
};
