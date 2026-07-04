<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $perms = [
            ['prf.approve_procurement', 'Approve PRF — Procurement stage', 'procurement'],
            ['prf.approve_ehs',         'Approve PRF — EHS stage',         'ehs'],
            ['prf.approve_depot',       'Approve PRF — Depot Manager',     'procurement'],
        ];

        foreach ($perms as [$key, $label, $group]) {
            DB::table('permissions')->updateOrInsert(
                ['key' => $key],
                ['label_en' => $label, 'group' => $group, 'updated_at' => $now, 'created_at' => $now],
            );
        }

        // Grant each stage to the role that historically handled it (+ admin).
        $grants = [
            'admin'         => ['prf.approve_procurement', 'prf.approve_ehs', 'prf.approve_depot'],
            'procurement'   => ['prf.approve_procurement'],
            'ehs'           => ['prf.approve_ehs'],
            'depot_manager' => ['prf.approve_depot'],
        ];

        foreach ($grants as $role => $keys) {
            foreach ($keys as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role' => $role, 'permission_key' => $key],
                    ['updated_at' => $now, 'created_at' => $now],
                );
            }
        }
    }

    public function down(): void
    {
        $keys = ['prf.approve_procurement', 'prf.approve_ehs', 'prf.approve_depot'];
        DB::table('role_permissions')->whereIn('permission_key', $keys)->delete();
        DB::table('permissions')->whereIn('key', $keys)->delete();
    }
};
