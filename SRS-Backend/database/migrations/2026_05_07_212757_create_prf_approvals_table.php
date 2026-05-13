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
        Schema::create('prf_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prf_id')->constrained('prfs')->cascadeOnDelete();
            $table->enum('role', ['procurement', 'ehs', 'depot_manager']);
            $table->enum('action', ['approved', 'rejected']);
            $table->foreignId('approver_id')->constrained('users')->cascadeOnDelete();
            $table->text('comment')->nullable();
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();

            $table->index(['prf_id', 'role']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prf_approvals');
    }
};
