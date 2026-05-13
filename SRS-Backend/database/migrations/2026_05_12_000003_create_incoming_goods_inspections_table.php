<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incoming_goods_inspections', function (Blueprint $table) {
            $table->id();
            $table->string('igi_number', 64)->unique();
            $table->foreignId('po_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->date('date')->nullable();
            $table->string('supplier_name', 255)->nullable();
            $table->string('delivery_note_no', 100)->nullable();
            $table->text('photos_notes')->nullable();
            $table->enum('status', ['draft', 'submitted', 'approved', 'rejected'])->default('draft');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incoming_goods_inspections');
    }
};
