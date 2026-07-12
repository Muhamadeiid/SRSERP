<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fleet_check_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fleet_check_id')->constrained('fleet_checks')->cascadeOnDelete();
            $table->string('item_name');
            $table->enum('result', ['pass', 'fail', 'na'])->default('na');
            $table->text('remarks')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_check_items');
    }
};
