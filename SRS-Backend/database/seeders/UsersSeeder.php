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
            ['name' => 'Admin User',          'email' => 'admin@srs.com',          'role' => 'admin',         'department' => 'admin'],
            // Depot Manager
            ['name' => 'Depot Manager',       'email' => 'depot@srs.com',          'role' => 'depot_manager', 'department' => 'admin'],
            // Procurement
            ['name' => 'Procurement Officer', 'email' => 'procurement@srs.com',    'role' => 'procurement',   'department' => 'admin'],
            // EHS
            ['name' => 'EHS Officer',         'email' => 'ehs@srs.com',            'role' => 'ehs',           'department' => 'admin'],
            // Managers per department
            ['name' => 'HR Manager',          'email' => 'manager.hr@srs.com',     'role' => 'hr',            'department' => 'admin'],
            ['name' => 'CM Manager',          'email' => 'manager.cm@srs.com',     'role' => 'manager',       'department' => 'cm'],
            ['name' => 'HM Manager',          'email' => 'manager.hm@srs.com',     'role' => 'manager',       'department' => 'hm'],
            ['name' => 'PM Manager',          'email' => 'manager.pm@srs.com',     'role' => 'manager',       'department' => 'pm'],
            // Staff per department
            ['name' => 'CM Staff',            'email' => 'staff.cm@srs.com',       'role' => 'staff',         'department' => 'cm'],
            ['name' => 'HM Staff',            'email' => 'staff.hm@srs.com',       'role' => 'staff',         'department' => 'hm'],
            ['name' => 'PM Staff',            'email' => 'staff.pm@srs.com',       'role' => 'staff',         'department' => 'pm'],
            ['name' => 'Warranty Staff',      'email' => 'staff.warranty@srs.com', 'role' => 'staff',         'department' => 'warranty'],
        ];

        foreach ($users as $data) {
            User::updateOrCreate(
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
