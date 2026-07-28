<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_tasks', function (Blueprint $table) {
            $table->unsignedTinyInteger('train_number')->nullable()->after('equipment_id');
            $table->unsignedTinyInteger('unit_number')->nullable()->after('train_number');
            $table->string('car_code', 10)->nullable()->after('unit_number');
        });

        Schema::create('maintenance_task_viewers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['maintenance_task_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_task_viewers');
        Schema::table('maintenance_tasks', function (Blueprint $table) {
            $table->dropColumn(['train_number', 'unit_number', 'car_code']);
        });
    }
};
