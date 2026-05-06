<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_balances', function (Blueprint $table) {
            $table->smallInteger('annual_remaining')->nullable()->after('annual');
            $table->smallInteger('casual_remaining')->nullable()->after('casual');
            $table->smallInteger('sick_remaining')->nullable()->after('sick');
            $table->smallInteger('early_remaining')->nullable()->after('early');
        });

        // Seed remaining = total for existing rows
        DB::statement('UPDATE leave_balances SET annual_remaining = annual, casual_remaining = casual, sick_remaining = sick, early_remaining = early');
    }

    public function down(): void
    {
        Schema::table('leave_balances', function (Blueprint $table) {
            $table->dropColumn(['annual_remaining', 'casual_remaining', 'sick_remaining', 'early_remaining']);
        });
    }
};
