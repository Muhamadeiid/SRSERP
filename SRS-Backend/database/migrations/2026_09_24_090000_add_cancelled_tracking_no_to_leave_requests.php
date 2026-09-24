<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->string('cancelled_tracking_no')->nullable()->after('tracking_no');
        });

        // Bring already-cancelled official EG1/GZ requests under the same rule
        // on deployment, then compact only the affected series.
        $prefixes = [
            'LRF-EG1-' => 'LRF-EG1-',
            'LRF-GZ-' => 'LRF-GZ-',
            'OTR-EG1-' => 'OTR-EG1-',
            'OTR-GZ-' => 'OTR-GZ-',
        ];
        DB::table('leave_requests')
            ->where('status', 'cancelled')
            ->whereNotNull('tracking_no')
            ->orderBy('id')
            ->get(['id', 'tracking_no'])
            ->each(function ($request) use (&$prefixes) {
                if (!preg_match('/^((?:LRF|OTR)-(?:EG1|GZ)-)(\d+)$/i', (string) $request->tracking_no, $matches)) {
                    return;
                }

                $prefixes[strtoupper($matches[1])] = $matches[1];
                DB::table('leave_requests')->where('id', $request->id)->update([
                    'cancelled_tracking_no' => $request->tracking_no,
                    'tracking_no' => null,
                ]);
            });

        foreach ($prefixes as $prefix) {
            $active = DB::table('leave_requests')
                ->where('tracking_no', 'like', $prefix . '%')
                ->whereNotIn('status', ['cancelled', 'rejected', 'rescheduled'])
                ->orderByRaw('COALESCE(approved_at, created_at) ASC')
                ->orderBy('id')
                ->get(['id']);

            foreach ($active as $request) {
                DB::table('leave_requests')->where('id', $request->id)->update([
                    'tracking_no' => "__TRACKING_RESEQUENCE__{$request->id}",
                ]);
            }

            foreach ($active->values() as $index => $request) {
                DB::table('leave_requests')->where('id', $request->id)->update([
                    'tracking_no' => $prefix . str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn('cancelled_tracking_no');
        });
    }
};
