<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        // Add 'manager' to the role ENUM
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','depot_manager','manager','staff') NOT NULL DEFAULT 'staff'");
    }

    public function down(): void
    {
        // Remove 'manager' (any managers become 'staff' first to avoid constraint errors)
        DB::statement("UPDATE users SET role = 'staff' WHERE role = 'manager'");
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','depot_manager','staff') NOT NULL DEFAULT 'staff'");
    }
};
