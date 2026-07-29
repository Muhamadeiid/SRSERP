<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('employees', 'saturday_plan_code')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->string('saturday_plan_code', 50)
                    ->nullable()
                    ->after('saturday_group')
                    ->index();
            });
        }

        DB::table('employees')
            ->whereNotNull('saturday_group')
            ->whereNull('saturday_plan_code')
            ->update(['saturday_plan_code' => 'EG1']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('employees', 'saturday_plan_code')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->dropIndex(['saturday_plan_code']);
                $table->dropColumn('saturday_plan_code');
            });
        }
    }
};
