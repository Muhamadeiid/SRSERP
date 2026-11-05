<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The create migration already adds this column on a fresh database
        if (Schema::hasColumn('incident_reports', 'requester_employee_id')) {
            return;
        }

        Schema::table('incident_reports', function (Blueprint $table) {
            $table->foreignId('requester_employee_id')
                ->nullable()
                ->after('created_by')
                ->constrained('employees')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('incident_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requester_employee_id');
        });
    }
};
