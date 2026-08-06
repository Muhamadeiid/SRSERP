<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('leave_requests')) {
            return;
        }

        $groups = [];
        $finalized = DB::table('leave_requests')
            ->whereNotNull('tracking_no')
            ->where(function ($query) {
                $query->whereIn('status', ['approved', 'cancellation_pending'])
                    ->orWhere(function ($cancelled) {
                        $cancelled->where('status', 'cancelled')->whereNotNull('approved_at');
                    });
            })
            ->orderByRaw('COALESCE(request_date, DATE(created_at))')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'tracking_no']);

        foreach ($finalized as $request) {
            if (preg_match('/^(.*-)(\d{4})$/', (string) $request->tracking_no, $matches)) {
                $groups[$matches[1]][] = $request->id;
            }
        }

        foreach ($groups as $prefix => $ids) {
            foreach ($ids as $id) {
                DB::table('leave_requests')->where('id', $id)->update([
                    'tracking_no' => '__TRACKING_DATE_ORDER__' . $id,
                ]);
            }

            foreach (array_values($ids) as $index => $id) {
                DB::table('leave_requests')->where('id', $id)->update([
                    'tracking_no' => $prefix . str_pad((string) ($index + 1), 4, '0', STR_PAD_LEFT),
                ]);
            }
        }
    }

    public function down(): void
    {
        // The previous sequence cannot be reconstructed safely.
    }
};
