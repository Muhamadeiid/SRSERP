<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Two changes bundled together:
     *  1. Rename the display label of role 'admin' to "Super Admin" everywhere
     *     the frontend reads it from (the lookups table). The DB enum keeps
     *     'admin' as the machine value so nothing needs re-migrating.
     *  2. Add users.is_team_manager — the flag that decides whether a user
     *     shows up in Manager Account Assignments. HR/depot/manager default
     *     to true; admin/staff/procurement/ehs default to false.
     */
    public function up(): void
    {
        // 1. Rename the admin label in lookups (role type)
        DB::table('lookups')
            ->where('type', 'role')
            ->where('key', 'admin')
            ->update(['label_en' => 'Super Admin', 'label_ar' => 'مشرف عام']);

        // 2. Add is_team_manager flag on users
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_team_manager')->default(false)->after('is_active');
        });

        // Seed defaults: anyone who historically has a management role becomes
        // a team_manager, admin/staff/procurement/ehs stay false.
        DB::table('users')
            ->whereIn('role', ['depot_manager', 'manager', 'hr'])
            ->update(['is_team_manager' => true]);
    }

    public function down(): void
    {
        DB::table('lookups')
            ->where('type', 'role')
            ->where('key', 'admin')
            ->update(['label_en' => 'Admin', 'label_ar' => 'مشرف عام']);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_team_manager');
        });
    }
};
