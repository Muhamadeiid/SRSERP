<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Extend the existing ENUM(role) to include the new procurement roles.
        // Done via raw SQL because Laravel's schema builder doesn't support ENUM modifications.
        \DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('admin','manager','staff','depot_manager','procurement','ehs')
            NOT NULL DEFAULT 'staff'
        ");
    }

    public function down(): void
    {
        \DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('admin','manager','staff','depot_manager')
            NOT NULL DEFAULT 'staff'
        ");
    }
};
