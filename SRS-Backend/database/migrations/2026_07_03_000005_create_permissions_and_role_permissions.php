<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->string('label_en', 150);
            $table->string('group', 50)->nullable();   // 'workforce', 'users', 'leaves', etc.
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->string('role', 50);                // matches users.role enum
            $table->string('permission_key', 100);
            $table->timestamps();

            $table->unique(['role', 'permission_key']);
            $table->index('role');
            $table->foreign('permission_key')->references('key')->on('permissions')->cascadeOnDelete();
        });

        // Seed permission catalog
        $now = now();
        $perms = [
            // Workforce
            ['workforce.view',           'View Workforce',                'workforce'],
            ['workforce.edit',           'Add / Edit Employees',          'workforce'],
            ['workforce.delete',         'Delete Employees',              'workforce'],
            ['workforce.import',         'Import / Export Employees',     'workforce'],
            ['workforce.view_ex',        'View Ex-Employees',             'workforce'],
            // Leaves
            ['leaves.submit',            'Submit Leave Requests',         'leaves'],
            ['leaves.approve_manager',   'Approve as Direct Manager',     'leaves'],
            ['leaves.approve_hr',        'Approve as HR / Final',         'leaves'],
            ['leaves.master_list',       'Access Leave Master List',      'leaves'],
            // Resignations
            ['resignations.submit',      'Create Resignation Forms',      'resignations'],
            ['resignations.finalize',    'Finalize / Set Last Working Date', 'resignations'],
            // Attendance
            ['attendance.view',          'View Attendance',               'attendance'],
            ['attendance.edit',          'Edit Attendance Records',       'attendance'],
            // Assets
            ['assets.view',              'View Assets',                   'assets'],
            ['assets.edit',              'Add / Edit Assets',             'assets'],
            // Org Chart
            ['orgchart.view',            'View Org Chart',                'orgchart'],
            ['orgchart.edit',            'Change Direct Managers',        'orgchart'],
            // Users & Settings
            ['users.view',               'View User Accounts',            'admin'],
            ['users.manage',             'Create / Edit / Delete Users',  'admin'],
            ['settings.master_data',     'Manage Master Data (lookups)',  'admin'],
            ['settings.positions',       'Manage Positions',              'admin'],
            ['settings.permissions',     'Manage Permission Matrix',      'admin'],
            ['settings.team_transfer',   'Perform Team Transfers',        'admin'],
            // Procurement / EHS
            ['procurement.access',       'Access Procurement Module',     'procurement'],
            ['ehs.access',               'Access EHS Module',             'ehs'],
        ];

        foreach ($perms as [$key, $label, $group]) {
            DB::table('permissions')->insert([
                'key' => $key, 'label_en' => $label, 'group' => $group,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // Seed default grants that mirror the current hard-coded checks so nothing breaks.
        $grants = [
            'admin' => 'ALL',
            'depot_manager' => [
                'workforce.view', 'workforce.edit', 'workforce.import', 'workforce.view_ex',
                'leaves.submit', 'leaves.approve_manager', 'leaves.approve_hr', 'leaves.master_list',
                'resignations.submit', 'resignations.finalize',
                'attendance.view', 'attendance.edit',
                'assets.view', 'assets.edit',
                'orgchart.view', 'orgchart.edit',
            ],
            'hr' => [
                'workforce.view', 'workforce.edit', 'workforce.view_ex',
                'leaves.submit', 'leaves.approve_hr', 'leaves.master_list',
                'resignations.submit', 'resignations.finalize',
                'attendance.view', 'attendance.edit',
                'assets.view',
                'orgchart.view',
            ],
            'manager' => [
                'workforce.view',
                'leaves.submit', 'leaves.approve_manager',
                'attendance.view',
                'orgchart.view',
            ],
            'procurement' => [
                'leaves.submit', 'procurement.access',
            ],
            'ehs' => [
                'leaves.submit', 'ehs.access',
            ],
            'staff' => [
                'leaves.submit',
            ],
        ];

        $allKeys = array_column($perms, 0);
        foreach ($grants as $role => $keys) {
            $keys = $keys === 'ALL' ? $allKeys : $keys;
            foreach ($keys as $key) {
                DB::table('role_permissions')->insert([
                    'role' => $role, 'permission_key' => $key,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
    }
};
