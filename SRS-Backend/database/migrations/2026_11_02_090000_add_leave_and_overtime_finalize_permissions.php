<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $permissions = [
            ['key' => 'leaves.finalize', 'label_en' => 'Finalize Leave Approvals', 'group' => 'leaves'],
            ['key' => 'overtime.finalize', 'label_en' => 'Finalize Overtime Approvals', 'group' => 'leaves'],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['key' => $permission['key']],
                $permission + ['created_at' => $now, 'updated_at' => $now],
            );

            foreach (['admin', 'depot_manager'] as $role) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role' => $role, 'permission_key' => $permission['key']],
                    ['created_at' => $now, 'updated_at' => $now],
                );
            }
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->whereIn('permission_key', ['leaves.finalize', 'overtime.finalize'])->delete();
        DB::table('permissions')->whereIn('key', ['leaves.finalize', 'overtime.finalize'])->delete();
    }
};
