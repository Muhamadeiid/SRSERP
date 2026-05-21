<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Remove duplicate rows first, keeping the one with the smallest id
        DB::statement('
            DELETE FROM attendance_logs
            WHERE id NOT IN (
                SELECT min_id FROM (
                    SELECT MIN(id) as min_id
                    FROM attendance_logs
                    GROUP BY punch_code, timestamp
                ) as t
            )
        ');

        Schema::table('attendance_logs', function (Blueprint $table) {
            $table->unique(['punch_code', 'timestamp'], 'attendance_logs_punch_code_timestamp_unique');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_logs', function (Blueprint $table) {
            $table->dropUnique('attendance_logs_punch_code_timestamp_unique');
        });
    }
};
