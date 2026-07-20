<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_assets', function (Blueprint $table) {
            $table->index(['status', 'condition'], 'employee_assets_status_condition_index');
        });
    }

    public function down(): void
    {
        Schema::table('employee_assets', function (Blueprint $table) {
            $table->dropIndex('employee_assets_status_condition_index');
        });
    }
};
