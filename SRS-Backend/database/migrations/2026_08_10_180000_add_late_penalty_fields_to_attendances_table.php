<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->decimal('late_penalty_override_hours', 6, 2)->nullable()->after('absence_deduction_override_reason');
            $table->string('late_penalty_override_reason', 500)->nullable()->after('late_penalty_override_hours');
            $table->boolean('late_caused_disruption')->default(false)->after('late_penalty_override_reason');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['late_penalty_override_hours', 'late_penalty_override_reason', 'late_caused_disruption']);
        });
    }
};
