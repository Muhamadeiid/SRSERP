<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('po_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->foreignId('prf_item_id')->nullable()->constrained('prf_items')->nullOnDelete();
            $table->unsignedSmallInteger('no');
            $table->string('item_description');
            $table->string('stock')->nullable();
            $table->string('average_con')->nullable();
            $table->decimal('qty', 10, 3)->default(0);
            $table->string('unit')->nullable()->default('pcs');
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->decimal('total', 14, 2)->nullable();
            $table->text('remark')->nullable();
            $table->timestamps();

            $table->index('po_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
    }
};
