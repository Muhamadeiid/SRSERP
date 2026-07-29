<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('lookups', 'show_in_filter')) {
            Schema::table('lookups', function (Blueprint $table) {
                $table->boolean('show_in_filter')->default(true)->after('is_active');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('lookups', 'show_in_filter')) {
            Schema::table('lookups', function (Blueprint $table) {
                $table->dropColumn('show_in_filter');
            });
        }
    }
};
