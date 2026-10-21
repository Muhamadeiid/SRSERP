<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','material_controller','procurement','ehs','ehs_manager','hr','store_staff')
                NOT NULL DEFAULT 'staff'"
        );

        DB::statement("ALTER TABLE prfs MODIFY COLUMN status ENUM(
            'draft','pending_material','pending_procurement','pending_ehs','pending_depot','approved','rejected','cancelled'
        ) NOT NULL DEFAULT 'pending_material'");

        DB::statement("ALTER TABLE prf_approvals MODIFY COLUMN role ENUM(
            'material_controller','procurement','ehs','ehs_manager','depot_manager'
        ) NOT NULL");

        $now = now();
        DB::table('lookups')->updateOrInsert(
            ['type' => 'role', 'key' => 'material_controller'],
            [
                'label_en' => 'Material Controller',
                'label_ar' => 'مراقب المواد',
                'color' => 'indigo',
                'sort' => 6,
                'is_active' => true,
                'updated_at' => $now,
                'created_at' => $now,
            ]
        );

        DB::table('permissions')->updateOrInsert(
            ['key' => 'prf.approve_material'],
            [
                'label_en' => 'Approve PRF - Material Controller stage',
                'group' => 'procurement',
                'updated_at' => $now,
                'created_at' => $now,
            ]
        );

        foreach (['admin', 'material_controller'] as $role) {
            DB::table('role_permissions')->updateOrInsert(
                ['role' => $role, 'permission_key' => 'prf.approve_material'],
                ['updated_at' => $now, 'created_at' => $now]
            );
        }
    }

    public function down(): void
    {
        DB::table('prfs')->where('status', 'pending_material')->update(['status' => 'pending_procurement']);
        DB::table('prf_approvals')->where('role', 'material_controller')->delete();
        DB::table('role_permissions')->where('permission_key', 'prf.approve_material')->delete();
        DB::table('permissions')->where('key', 'prf.approve_material')->delete();
        DB::table('lookups')->where(['type' => 'role', 'key' => 'material_controller'])->delete();
        DB::table('users')->where('role', 'material_controller')->update(['role' => 'staff']);

        DB::statement("ALTER TABLE prfs MODIFY COLUMN status ENUM(
            'draft','pending_procurement','pending_ehs','pending_depot','approved','rejected','cancelled'
        ) NOT NULL DEFAULT 'pending_procurement'");

        DB::table('prf_approvals')->where('role', 'ehs_manager')->update(['role' => 'ehs']);
        DB::statement("ALTER TABLE prf_approvals MODIFY COLUMN role ENUM(
            'procurement','ehs','depot_manager'
        ) NOT NULL");

        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','ehs_manager','hr','store_staff')
                NOT NULL DEFAULT 'staff'"
        );
    }
};
