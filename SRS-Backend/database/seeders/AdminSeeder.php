<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
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
