<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('id')
                  ->constrained('equipment')->nullOnDelete();
            $table->string('car_type', 20)->nullable()->after('type');
            $table->unsignedSmallInteger('train_number')->nullable()->after('fleet');
            $table->unsignedTinyInteger('unit_index')->nullable()->after('train_number');
        });
    }

    public function down(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn(['parent_id', 'car_type', 'train_number', 'unit_index']);
        });
    }
};
