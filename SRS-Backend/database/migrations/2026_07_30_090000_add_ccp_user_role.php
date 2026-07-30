<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','hr') NOT NULL DEFAULT 'staff'"
            );
        }

        if (Schema::hasTable('lookups')) {
            DB::table('lookups')->updateOrInsert(
                ['type' => 'role', 'key' => 'ccp'],
                [
                    'label_en' => 'CCP',
                    'label_ar' => 'CCP',
                    'color' => 'cyan',
                    'sort' => 8,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'ccp')->update(['role' => 'staff']);
        DB::table('lookups')->where('type', 'role')->where('key', 'ccp')->delete();

        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','staff','depot_manager','procurement','ehs','hr') NOT NULL DEFAULT 'staff'"
            );
        }
    }
};
