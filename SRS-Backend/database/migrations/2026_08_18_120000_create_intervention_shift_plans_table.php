<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('intervention_shift_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('shift_date');
            $table->enum('shift', ['morning', 'afternoon', 'night']);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['employee_id', 'shift_date']);
            $table->index(['shift_date', 'shift']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intervention_shift_plans');
    }
};
