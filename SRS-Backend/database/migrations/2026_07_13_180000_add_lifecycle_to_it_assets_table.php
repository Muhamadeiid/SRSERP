<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('it_assets', function (Blueprint $table) {
            $table->enum('condition', ['Good', 'Damaged', 'Lost'])->default('Good')->after('activity');
            $table->enum('status', ['Available', 'Assigned', 'Damaged', 'Lost', 'Maintenance'])
                ->default('Available')->after('condition');
            $table->index(['status', 'condition']);
        });

        \DB::table('it_assets')->whereNotNull('user_name')->update(['status' => 'Assigned']);
    }

    public function down(): void
    {
        Schema::table('it_assets', function (Blueprint $table) {
            $table->dropIndex(['status', 'condition']);
            $table->dropColumn(['condition', 'status']);
        });
    }
};
