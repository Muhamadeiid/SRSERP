<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('po_number')->unique();                   // POF-EG1-2026-0001
            $table->foreignId('prf_id')->constrained('prfs')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->date('date');
            $table->string('category')->nullable();
            $table->string('vendor')->nullable();
            $table->decimal('tax', 10, 2)->default(0);
            $table->decimal('withholding_tax', 10, 2)->default(0);
            $table->string('delivery_terms')->nullable();
            $table->string('delivery_period')->nullable()->default('Week');
            $table->string('payment_terms')->nullable()->default('100% After Received');
            $table->string('receipt_location')->nullable()->default('Company Warehouse');
            $table->text('comments')->nullable();
            $table->enum('status', ['draft', 'issued', 'received', 'cancelled'])->default('draft');
            $table->timestamps();

            $table->index('prf_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_orders');
    }
};
