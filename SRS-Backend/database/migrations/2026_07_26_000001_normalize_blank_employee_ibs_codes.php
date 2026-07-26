<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('employees')
            ->whereNotNull('ibs_code')
            ->whereRaw("TRIM(ibs_code) = ''")
            ->update(['ibs_code' => null]);
    }

    public function down(): void
    {
        // Blank IBS codes must remain null so the unique index can accept
        // multiple employees who do not have an IBS code yet.
    }
};
