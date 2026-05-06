<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * This table stores RAW biometric data from the .dat files
     */
    public function up(): void
    {
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->id();
            $table->string('punch_code'); // From biometric device
            $table->dateTime('timestamp'); // Exact punch time
            $table->string('device_id')->nullable(); // Which device/location
            $table->string('source')->default('biometric'); // biometric, manual, api
            $table->json('raw_data')->nullable(); // Store full row for reference
            $table->boolean('processed')->default(false); // Has this been converted to attendance?
            $table->timestamps();

            // Indexes
            $table->index('punch_code');
            $table->index('timestamp');
            $table->index(['punch_code', 'timestamp']);
            $table->index('processed');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance_logs');
    }
};
