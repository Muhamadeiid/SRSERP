<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('leave_balances')
            ->where('annual', 14)
            ->orderBy('id')
            ->chunkById(200, function ($balances) {
                foreach ($balances as $balance) {
                    $annualRemaining = $balance->annual_remaining;
                    $casualRemaining = $balance->casual_remaining ?? $balance->casual ?? 0;

                    DB::table('leave_balances')
                        ->where('id', $balance->id)
                        ->update([
                            'annual' => 21,
                            'annual_remaining' => $annualRemaining === null
                                ? null
                                : min(21, (float) $annualRemaining + (float) $casualRemaining),
                        ]);
                }
            });
    }

    public function down(): void
    {
        // This is a one-way data correction. Splitting a pooled balance back
        // into legacy Annual and Casual balances would lose usage history.
    }
};
