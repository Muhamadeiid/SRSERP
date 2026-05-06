<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // Regular employees only.
            // Group A = off on EVEN ISO-week Saturdays (week 2, 4, 6 …)
            // Group B = off on ODD  ISO-week Saturdays (week 1, 3, 5 …)
            $table->enum('saturday_group', ['A', 'B'])->nullable()->after('department');

            // Intervention employees only.
            // The day of week they are off: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
            $table->tinyInteger('weekly_off_day')->unsigned()->nullable()->after('saturday_group');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['saturday_group', 'weekly_off_day']);
        });
    }
};
