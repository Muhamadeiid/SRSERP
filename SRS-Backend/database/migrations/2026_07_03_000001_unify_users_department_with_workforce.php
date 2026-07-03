<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('admin','manager','staff','depot_manager','procurement','ehs','hr')
            NOT NULL DEFAULT 'staff'
        ");

        DB::statement("UPDATE users SET role = 'hr' WHERE department = 'human_resources'");

        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN department ENUM(
                'all','inventory','human_resources','maintenance','control',
                'cm','hm','pm','warranty','cm_intervention','admin'
            ) NOT NULL DEFAULT 'admin'
        ");

        DB::statement("
            UPDATE users SET department = CASE department
                WHEN 'all'              THEN 'admin'
                WHEN 'human_resources'  THEN 'admin'
                WHEN 'maintenance'      THEN 'cm'
                WHEN 'inventory'        THEN 'admin'
                WHEN 'control'          THEN 'admin'
                ELSE department
            END
        ");

        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN department ENUM('cm','hm','pm','warranty','cm_intervention','admin')
            NOT NULL DEFAULT 'admin'
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN department ENUM(
                'all','inventory','human_resources','maintenance','control',
                'cm','hm','pm','warranty','cm_intervention','admin'
            ) NOT NULL DEFAULT 'all'
        ");

        DB::statement("
            UPDATE users SET department = CASE department
                WHEN 'admin'   THEN 'all'
                WHEN 'cm'      THEN 'maintenance'
                WHEN 'hm'      THEN 'maintenance'
                WHEN 'pm'      THEN 'maintenance'
                WHEN 'warranty'        THEN 'maintenance'
                WHEN 'cm_intervention' THEN 'maintenance'
                ELSE department
            END
        ");

        DB::statement("UPDATE users SET department = 'human_resources' WHERE role = 'hr'");
        DB::statement("UPDATE users SET role = 'staff' WHERE role = 'hr'");

        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN department ENUM('all','inventory','human_resources','maintenance','control')
            NOT NULL DEFAULT 'all'
        ");

        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('admin','manager','staff','depot_manager','procurement','ehs')
            NOT NULL DEFAULT 'staff'
        ");
    }
};
