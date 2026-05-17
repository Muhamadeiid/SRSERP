<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UsersSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            // Admin
            ['name' => 'Admin User',          'email' => 'admin@srs.com',          'role' => 'admin',         'department' => 'all'],
            // Depot Manager
            ['name' => 'Depot Manager',       'email' => 'depot@srs.com',          'role' => 'depot_manager', 'department' => 'all'],
            // Procurement
            ['name' => 'Procurement Officer', 'email' => 'procurement@srs.com',    'role' => 'procurement',   'department' => 'all'],
            // EHS
            ['name' => 'EHS Officer',         'email' => 'ehs@srs.com',            'role' => 'ehs',           'department' => 'all'],
            // Managers per department
            ['name' => 'HR Manager',          'email' => 'manager.hr@srs.com',     'role' => 'manager',       'department' => 'human_resources'],
            ['name' => 'Inventory Manager',   'email' => 'manager.inv@srs.com',    'role' => 'manager',       'department' => 'inventory'],
            ['name' => 'Maintenance Manager', 'email' => 'manager.maint@srs.com',  'role' => 'manager',       'department' => 'maintenance'],
            ['name' => 'Control Manager',     'email' => 'manager.ctrl@srs.com',   'role' => 'manager',       'department' => 'control'],
            // Staff per department
            ['name' => 'HR Staff',            'email' => 'staff.hr@srs.com',       'role' => 'staff',         'department' => 'human_resources'],
            ['name' => 'Inventory Staff',     'email' => 'staff.inv@srs.com',      'role' => 'staff',         'department' => 'inventory'],
            ['name' => 'Maintenance Staff',   'email' => 'staff.maint@srs.com',    'role' => 'staff',         'department' => 'maintenance'],
            ['name' => 'Control Staff',       'email' => 'staff.ctrl@srs.com',     'role' => 'staff',         'department' => 'control'],
        ];

        foreach ($users as $data) {
            User::firstOrCreate(
                ['email' => $data['email']],
                [
                    'name'       => $data['name'],
                    'password'   => Hash::make('password'),
                    'role'       => $data['role'],
                    'department' => $data['department'],
                    'is_active'  => true,
                ]
            );
        }

        $this->command->info('Users seeder: ' . count($users) . ' accounts ready.');
    }
}
