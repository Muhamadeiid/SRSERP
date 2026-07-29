<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('leave_requests', 'casual_available_balance')) {
            Schema::table('leave_requests', function (Blueprint $table) {
                $table->decimal('casual_available_balance', 8, 2)
                    ->nullable()
                    ->after('available_balance');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('leave_requests', 'casual_available_balance')) {
            Schema::table('leave_requests', function (Blueprint $table) {
                $table->dropColumn('casual_available_balance');
            });
        }
    }
};
