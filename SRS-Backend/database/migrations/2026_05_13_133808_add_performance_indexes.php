<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->addIndexIfMissing('prfs',                        ['status', 'requested_by', 'created_at']);
        $this->addIndexIfMissing('purchase_orders',             ['status', 'prf_id']);
        $this->addIndexIfMissing('incoming_goods_inspections',  ['po_id', 'status']);
        $this->addIndexIfMissing('leave_requests',              ['employee_id', 'status']);
        $this->addIndexIfMissing('attendances',                  ['employee_id', 'date']);
    }

    private function addIndexIfMissing(string $table, array $columns): void
    {
        Schema::table($table, function (Blueprint $t) use ($table, $columns) {
            foreach ($columns as $col) {
                $existing = collect(\DB::select("SHOW INDEX FROM `{$table}` WHERE Column_name = ?", [$col]))
                    ->pluck('Column_name');
                if ($existing->isEmpty()) {
                    $t->index($col);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('prfs', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['requested_by']);
            $table->dropIndex(['created_at']);
        });
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['prf_id']);
        });
    }
};
