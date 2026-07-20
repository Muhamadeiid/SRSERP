<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->index(['type', 'status', 'created_at'], 'lr_type_status_created_idx');
            $table->index(['type', 'status', 'ot_date'], 'lr_type_status_ot_date_idx');
            $table->index(['type', 'status', 'start_date', 'end_date'], 'lr_type_status_leave_dates_idx');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropIndex('lr_type_status_created_idx');
            $table->dropIndex('lr_type_status_ot_date_idx');
            $table->dropIndex('lr_type_status_leave_dates_idx');
        });
    }
};
