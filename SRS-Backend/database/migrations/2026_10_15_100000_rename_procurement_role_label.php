<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('lookups')
            ->where(['type' => 'role', 'key' => 'procurement'])
            ->update(['label_en' => 'Procurement Specialist', 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('lookups')
            ->where(['type' => 'role', 'key' => 'procurement'])
            ->update(['label_en' => 'Procurement', 'updated_at' => now()]);
    }
};
