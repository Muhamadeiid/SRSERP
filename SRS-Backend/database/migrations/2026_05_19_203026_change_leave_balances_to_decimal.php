<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE leave_balances
            MODIFY annual           DECIMAL(8,2) NOT NULL DEFAULT 21,
            MODIFY annual_remaining DECIMAL(8,2) NULL,
            MODIFY casual           DECIMAL(8,2) NOT NULL DEFAULT 7,
            MODIFY casual_remaining DECIMAL(8,2) NULL,
            MODIFY sick             DECIMAL(8,2) NOT NULL DEFAULT 90,
            MODIFY sick_remaining   DECIMAL(8,2) NULL,
            MODIFY early            DECIMAL(8,2) NOT NULL DEFAULT 0,
            MODIFY early_remaining  DECIMAL(8,2) NULL
        ');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE leave_balances
            MODIFY annual           SMALLINT NOT NULL DEFAULT 21,
            MODIFY annual_remaining SMALLINT NULL,
            MODIFY casual           SMALLINT NOT NULL DEFAULT 7,
            MODIFY casual_remaining SMALLINT NULL,
            MODIFY sick             SMALLINT NOT NULL DEFAULT 90,
            MODIFY sick_remaining   SMALLINT NULL,
            MODIFY early            SMALLINT NOT NULL DEFAULT 0,
            MODIFY early_remaining  SMALLINT NULL
        ');
    }
};
