<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trains', function (Blueprint $table) {
            $table->string('id', 4)->primary();
            $table->string('name', 50);
            $table->unsignedSmallInteger('display_order')->default(999)->index();
            $table->timestamps();
        });

        Schema::create('maintenance_codes', function (Blueprint $table) {
            $table->string('code', 5)->primary();
            $table->string('name', 100);
            $table->string('color_hex', 7);
            $table->boolean('exclude_from_reminders')->default(false);
            $table->timestamps();
        });

        Schema::create('maintenance_schedule', function (Blueprint $table) {
            $table->id();
            $table->date('schedule_date')->index();
            $table->string('train_id', 4);
            $table->string('code', 5);
            $table->timestamps();
            $table->unique(['schedule_date', 'train_id']);
            $table->foreign('train_id')->references('id')->on('trains')->cascadeOnUpdate()->restrictOnDelete();
            $table->foreign('code')->references('code')->on('maintenance_codes')->cascadeOnUpdate()->restrictOnDelete();
        });

        Schema::create('schedule_day_meta', function (Blueprint $table) {
            $table->id();
            $table->date('schedule_date')->unique();
            $table->string('k6', 20)->nullable();
            $table->string('k5', 20)->nullable();
            $table->string('c_col', 20)->nullable();
            $table->string('k19', 20)->nullable();
            $table->string('remark', 255)->nullable();
            $table->timestamps();
        });

        $now = now();
        $order = ['01', '02', '12', '04', '13', '03', '14', '07', '05', '06', '15', '09', '10', '16', '08', '11', '17', '18', '19', '20'];
        DB::table('trains')->insert(array_map(fn ($id, $index) => [
            'id' => $id,
            'name' => "Train {$id}",
            'display_order' => $index + 1,
            'created_at' => $now,
            'updated_at' => $now,
        ], $order, array_keys($order)));

        DB::table('maintenance_codes')->insert([
            ['code' => 'A', 'name' => 'Type A Inspection', 'color_hex' => '#FFEB3B', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'B1', 'name' => 'Type B1 Maintenance', 'color_hex' => '#8BC34A', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'B2', 'name' => 'Type B2 Maintenance', 'color_hex' => '#8BC34A', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'B3', 'name' => 'Type B3 Maintenance', 'color_hex' => '#8BC34A', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'C', 'name' => 'Type C Service', 'color_hex' => '#FFFFFF', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'A+C', 'name' => 'Combined A+C', 'color_hex' => '#9C27B0', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'G', 'name' => 'Type G Maintenance', 'color_hex' => '#2196F3', 'exclude_from_reminders' => false, 'created_at' => $now, 'updated_at' => $now],
            ['code' => '9Y', 'name' => '9-Year Overhaul', 'color_hex' => '#F44336', 'exclude_from_reminders' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_day_meta');
        Schema::dropIfExists('maintenance_schedule');
        Schema::dropIfExists('maintenance_codes');
        Schema::dropIfExists('trains');
    }
};
