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
        Schema::create('prfs', function (Blueprint $table) {
            $table->id();
            $table->string('prf_number')->unique();              // e.g. PRF-EG1-2026-0001
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->string('delivery_location')->nullable();
            $table->string('delivery_contact')->nullable();
            $table->string('requester_phone')->nullable();
            $table->string('requester_email')->nullable();
            $table->json('material_category')->nullable();        // ["mechanical","electrical",...]
            $table->text('notes')->nullable();
            $table->enum('status', [
                'draft',
                'pending_procurement',
                'pending_ehs',
                'pending_depot',
                'approved',
                'rejected',
            ])->default('pending_procurement');
            $table->timestamps();

            $table->index('status');
            $table->index('requested_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prfs');
    }
};
