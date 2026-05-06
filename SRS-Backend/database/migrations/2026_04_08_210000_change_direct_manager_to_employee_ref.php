<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // 1. Drop the old FK constraint (direct_manager_id → users.id)
            $table->dropForeign(['direct_manager_id']);

            // 2. Clear existing values — old data was user IDs, new will be employee IDs
            //    (admin will re-assign in the UI)
        });

        DB::statement('UPDATE employees SET direct_manager_id = NULL');

        Schema::table('employees', function (Blueprint $table) {
            // 3. Re-add as self-referential FK → employees.id
            $table->foreign('direct_manager_id')
                  ->references('id')
                  ->on('employees')
                  ->nullOnDelete();

            // 4. Add user_id — links an employee record to their system user account
            $table->unsignedBigInteger('user_id')->nullable()->after('direct_manager_id');
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['direct_manager_id']);
            $table->dropForeign(['user_id']);
            $table->dropColumn('user_id');
        });

        DB::statement('UPDATE employees SET direct_manager_id = NULL');

        Schema::table('employees', function (Blueprint $table) {
            $table->foreign('direct_manager_id')
                  ->references('id')
                  ->on('users')
                  ->nullOnDelete();
        });
    }
};
