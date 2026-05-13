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
        Schema::create('prf_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prf_id')->constrained('prfs')->cascadeOnDelete();
            $table->unsignedInteger('sn');
            $table->string('description');
            $table->text('technical_specifications')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->string('unit', 50)->default('pcs');
            $table->text('ehs_requirements')->nullable();
            $table->date('required_by_date')->nullable();
            $table->timestamps();

            $table->index('prf_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prf_items');
    }
};
