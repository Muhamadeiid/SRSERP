<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','ehs_manager','hr','store_staff')
                NOT NULL DEFAULT 'staff'"
        );

        $now = now();
        DB::table('lookups')->updateOrInsert(
            ['type' => 'role', 'key' => 'ehs_manager'],
            [
                'label_en' => 'EHS Manager',
                'label_ar' => 'مدير السلامة والصحة المهنية',
                'color' => 'teal',
                'sort' => 7,
                'is_active' => true,
                'updated_at' => $now,
                'created_at' => $now,
            ]
        );

        $ehsPermissions = DB::table('role_permissions')
            ->where('role', 'ehs')
            ->pluck('permission_key')
            ->push('prf.approve_ehs')
            ->unique();

        foreach ($ehsPermissions as $permission) {
            DB::table('role_permissions')->updateOrInsert(
                ['role' => 'ehs_manager', 'permission_key' => $permission],
                ['created_at' => $now, 'updated_at' => $now]
            );
        }

        DB::table('role_permissions')
            ->where('role', 'ehs')
            ->where('permission_key', 'prf.approve_ehs')
            ->delete();
    }

    public function down(): void
    {
        $now = now();
        DB::table('role_permissions')->updateOrInsert(
            ['role' => 'ehs', 'permission_key' => 'prf.approve_ehs'],
            ['created_at' => $now, 'updated_at' => $now]
        );
        DB::table('role_permissions')->where('role', 'ehs_manager')->delete();
        DB::table('lookups')->where(['type' => 'role', 'key' => 'ehs_manager'])->delete();
        DB::table('users')->where('role', 'ehs_manager')->update(['role' => 'ehs']);

        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','hr','store_staff')
                NOT NULL DEFAULT 'staff'"
        );
    }
};
