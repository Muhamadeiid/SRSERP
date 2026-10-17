<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class CreateAdmin extends Command
{
    protected $signature = 'srs:create-admin {email}';
    protected $description = 'Create an initial administrator with an operator-chosen secret';

    public function handle(): int
    {
        $email = trim((string) $this->argument('email'));
        $name = $this->ask('Administrator name');
        $password = $this->secret('Password (at least 16 characters)');
        $confirmation = $this->secret('Confirm password');
        $validator = Validator::make([
            'email' => $email, 'name' => $name, 'password' => $password, 'password_confirmation' => $confirmation,
        ], ['email' => 'required|email|unique:users,email', 'name' => 'required|string|max:255', 'password' => 'required|string|min:16|confirmed']);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) $this->error($error);
            return self::FAILURE;
        }
        User::create(['email' => $email, 'name' => $name, 'password' => Hash::make($password), 'role' => 'admin', 'department' => 'admin', 'is_active' => true]);
        $this->info('Administrator created. No existing accounts were changed.');
        return self::SUCCESS;
    }
}
