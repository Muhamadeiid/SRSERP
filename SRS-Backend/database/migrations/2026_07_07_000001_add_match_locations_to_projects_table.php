<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (!Schema::hasColumn('projects', 'match_locations')) {
                $table->text('match_locations')->nullable()->after('match_prefix');
            }
        });

        DB::table('projects')
            ->where('code', 'GZ')
            ->whereNull('match_locations')
            ->update(['match_locations' => 'Ramses AbuGhates&Farz']);
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'match_locations')) {
                $table->dropColumn('match_locations');
            }
        });
    }
};
