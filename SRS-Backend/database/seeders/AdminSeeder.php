<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        if (!app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Default admin is disabled outside local/testing. Use srs:create-admin for initial setup.');
        }
        User::firstOrCreate(
            ['email' => 'admin@srs.com'],
            [
                'name'       => 'Admin User',
                'password'   => Hash::make('password'),
                'role'       => 'admin',
                'department' => 'admin',
                'is_active'  => true,
            ]
        );
    }
}
