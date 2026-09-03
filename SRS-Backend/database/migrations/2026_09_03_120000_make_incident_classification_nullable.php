<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('incident_reports') && Schema::hasColumn('incident_reports', 'classification')) {
            Schema::table('incident_reports', function (Blueprint $table) {
                $table->string('classification', 40)->nullable()->change();
                $table->string('concerned_area_department')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        // Existing unclassified reports cannot safely be made NOT NULL again.
    }
};
