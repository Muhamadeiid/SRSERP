<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_assets', function (Blueprint $table) {
            // New canonical link to issuing_sources; nullable so the backfill can populate it.
            $table->foreignId('issuing_source_id')->nullable()->after('employee_id')->constrained('issuing_sources')->nullOnDelete();
            // Link back to the IT inventory row this asset came from (if any).
            $table->foreignId('it_asset_id')->nullable()->after('issuing_source_id')->constrained('it_assets')->nullOnDelete();
            // Who signed for the returned asset.
            $table->foreignId('received_by_user_id')->nullable()->after('status')->constrained('users')->nullOnDelete();

            $table->index('issuing_source_id');
            $table->index('it_asset_id');
        });

        // Backfill issuing_source_id from the legacy enum.
        $map = [
            'EHS'                    => 'ehs',
            'IT'                     => 'it',
            'HR'                     => 'hr',
            'Inventory'              => 'inventory',
            'Corrective Maintenance' => 'cm',
            'Preventive Maintenance' => 'pm',
            'Other'                  => 'other',
        ];
        $sourceIds = DB::table('issuing_sources')->pluck('id', 'key');
        foreach ($map as $enum => $key) {
            if (!isset($sourceIds[$key])) continue;
            DB::table('employee_assets')
                ->where('issuing_department', $enum)
                ->update(['issuing_source_id' => $sourceIds[$key]]);
        }
    }

    public function down(): void
    {
        Schema::table('employee_assets', function (Blueprint $table) {
            $table->dropForeign(['issuing_source_id']);
            $table->dropForeign(['it_asset_id']);
            $table->dropForeign(['received_by_user_id']);
            $table->dropColumn(['issuing_source_id', 'it_asset_id', 'received_by_user_id']);
        });
    }
};
