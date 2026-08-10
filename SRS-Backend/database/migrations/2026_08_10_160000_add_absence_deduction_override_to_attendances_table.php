<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->decimal('absence_deduction_override_hours', 6, 2)->nullable()->after('overtime_hours');
            $table->string('absence_deduction_override_reason', 500)->nullable()->after('absence_deduction_override_hours');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['absence_deduction_override_hours', 'absence_deduction_override_reason']);
        });
    }
};
