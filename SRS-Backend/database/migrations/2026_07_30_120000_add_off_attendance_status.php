<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("
            ALTER TABLE attendances
            MODIFY status ENUM(
                'present',
                'absent',
                'late',
                'permission',
                'off',
                'wfh',
                'intervention',
                'incomplete',
                'shortage'
            ) NOT NULL DEFAULT 'absent'
        ");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::table('attendances')->where('status', 'off')->update(['status' => 'absent']);
        DB::statement("
            ALTER TABLE attendances
            MODIFY status ENUM(
                'present',
                'absent',
                'late',
                'permission',
                'wfh',
                'intervention',
                'incomplete',
                'shortage'
            ) NOT NULL DEFAULT 'absent'
        ");
    }
};
