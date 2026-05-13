<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('igi_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('igi_id')->constrained('incoming_goods_inspections')->cascadeOnDelete();
            $table->foreignId('po_item_id')->nullable()->nullOnDelete()->constrained('purchase_order_items');
            $table->unsignedSmallInteger('no');
            $table->string('description', 500)->nullable();
            $table->string('system', 255)->nullable();
            $table->string('batch_no', 255)->nullable();
            $table->decimal('qty_received', 12, 3)->nullable();
            $table->string('unit', 50)->nullable();
            $table->decimal('shelf_life', 8, 2)->nullable();
            $table->boolean('compliant_po')->nullable();
            $table->boolean('compliant_technical')->nullable();
            $table->boolean('compliant_ehs')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('igi_items');
    }
};
