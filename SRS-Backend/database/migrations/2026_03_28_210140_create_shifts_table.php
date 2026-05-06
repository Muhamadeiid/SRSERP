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
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // Morning, Night, Intervention
            $table->time('start_time'); // e.g., 08:00:00
            $table->time('end_time'); // e.g., 17:00:00
            $table->decimal('expected_hours', 4, 2); // e.g., 8.00 or 9.00
            $table->string('code')->unique(); // morning, night, intervention
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
