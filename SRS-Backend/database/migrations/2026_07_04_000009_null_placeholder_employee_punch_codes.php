<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('employees')
            ->whereIn(DB::raw('UPPER(TRIM(punch_code))'), [
                '',
                'WA',
                'N/A',
                'NA',
                'NONE',
                'NO',
                'NULL',
                '-',
                '--',
                '0',
            ])
            ->update(['punch_code' => null]);
    }

    public function down(): void
    {
        // Placeholder codes represented "no fingerprint"; restoring them would
        // reintroduce ambiguous biometric matches, so this migration is one-way.
    }
};
