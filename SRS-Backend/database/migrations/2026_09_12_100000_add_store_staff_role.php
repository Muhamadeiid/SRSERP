<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store staff — the Material Controller's team. They can OPEN and SEE
     * every release note so they know what parts have been asked for, but
     * only the Material Controller (and admin / depot manager) approves
     * the request and signs the note.
     */
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','hr','store_staff')
                NOT NULL DEFAULT 'staff'"
        );

        // Seed the display metadata so the UI can label the role — the DB
        // enum still enforces which values are valid.
        if (Schema::hasTable('lookups')) {
            $now = Carbon::now();
            DB::table('lookups')->updateOrInsert(
                ['type' => 'role', 'key' => 'store_staff'],
                [
                    'label_en'   => 'Store Staff',
                    'label_ar'   => 'موظف مخزن',
                    'color'      => 'sky',
                    'sort'       => 8,
                    'is_active'  => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('lookups')) {
            DB::table('lookups')->where(['type' => 'role', 'key' => 'store_staff'])->delete();
        }

        DB::statement(
            "ALTER TABLE users MODIFY COLUMN role
                ENUM('admin','manager','staff','ccp','depot_manager','procurement','ehs','hr')
                NOT NULL DEFAULT 'staff'"
        );
    }
};
