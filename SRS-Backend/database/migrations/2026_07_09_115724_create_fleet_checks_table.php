<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fleet_checks', function (Blueprint $table) {
            $table->id();
            $table->string('check_no', 30)->unique();
            $table->foreignId('equipment_id')->constrained('equipment')->cascadeOnDelete();
            $table->enum('check_type', ['daily', 'weekly', 'monthly', 'quarterly', 'annual']);
            $table->date('check_date');
            $table->foreignId('inspector_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('inspector_name')->nullable();
            $table->enum('status', ['scheduled', 'in_progress', 'passed', 'failed', 'partial'])->default('scheduled');
            $table->unsignedSmallInteger('total_items')->default(0);
            $table->unsignedSmallInteger('passed_items')->default(0);
            $table->unsignedSmallInteger('failed_items')->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_checks');
    }
};
