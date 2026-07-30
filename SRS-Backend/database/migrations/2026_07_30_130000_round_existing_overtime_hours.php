<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('leave_requests') || !Schema::hasColumn('leave_requests', 'hours')) {
            return;
        }

        DB::table('leave_requests')
            ->where('type', 'otr')
            ->whereNotNull('hours')
            ->update(['hours' => DB::raw('FLOOR(hours + 0.5)')]);
    }

    public function down(): void
    {
        // Rounded historical overtime cannot be reconstructed safely.
    }
};
