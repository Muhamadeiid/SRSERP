<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('role_permissions')) {
            return;
        }

        $now = now();
        $staffPermissions = DB::table('role_permissions')
            ->where('role', 'staff')
            ->pluck('permission_key');

        foreach ($staffPermissions as $permissionKey) {
            DB::table('role_permissions')->updateOrInsert(
                ['role' => 'ccp', 'permission_key' => $permissionKey],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('role_permissions')) {
            DB::table('role_permissions')->where('role', 'ccp')->delete();
        }
    }
};
