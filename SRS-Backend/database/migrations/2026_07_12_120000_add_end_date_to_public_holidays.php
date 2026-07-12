<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('public_holidays', function (Blueprint $table) {
            $table->date('end_date')->nullable()->after('date');
        });

        // Drop the unique constraint on `date` — a holiday can now span multiple days
        // and different holidays can no longer be identified by a single date alone.
        Schema::table('public_holidays', function (Blueprint $table) {
            try { $table->dropUnique(['date']); } catch (\Throwable $e) {}
        });
    }

    public function down(): void
    {
        Schema::table('public_holidays', function (Blueprint $table) {
            $table->dropColumn('end_date');
            $table->unique('date');
        });
    }
};
