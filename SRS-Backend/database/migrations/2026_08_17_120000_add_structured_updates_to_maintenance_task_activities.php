<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_task_activities', function (Blueprint $table) {
            $table->date('work_date')->nullable()->after('body');
            $table->text('work_done')->nullable()->after('work_date');
            $table->text('result')->nullable()->after('work_done');
            $table->text('next_steps')->nullable()->after('result');
            $table->text('completion_summary')->nullable()->after('next_steps');
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_task_activities', function (Blueprint $table) {
            $table->dropColumn([
                'work_date',
                'work_done',
                'result',
                'next_steps',
                'completion_summary',
            ]);
        });
    }
};
