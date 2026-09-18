<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('procurement_suppliers', function (Blueprint $table) {
            $table->timestamp('improvement_requested_at')->nullable()->after('next_evaluation_at');
            $table->timestamp('improvement_due_at')->nullable()->after('improvement_requested_at');
            $table->boolean('is_contractor')->default(false)->after('improvement_due_at');
            $table->timestamp('ohs_instructions_acknowledged_at')->nullable()->after('is_contractor');
            $table->string('ohs_acknowledgement_reference')->nullable()->after('ohs_instructions_acknowledged_at');
        });

        Schema::table('procurement_quotations', function (Blueprint $table) {
            $table->date('requested_date')->nullable()->after('reference');
            $table->decimal('available_quantity', 12, 3)->nullable()->after('lead_time_days');
            $table->decimal('minimum_order_quantity', 12, 3)->nullable()->after('available_quantity');
            $table->text('supporting_documents')->nullable()->after('notes');
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->boolean('direct_order')->default(false)->after('sole_supplier_justification');
            $table->text('direct_order_reason')->nullable()->after('direct_order');
            $table->foreignId('budget_plan_id')->nullable()->after('direct_order_reason')
                ->constrained('procurement_budget_plans')->nullOnDelete();
            $table->timestamp('dispatched_at')->nullable()->after('paid_at');
            $table->string('dispatched_to')->nullable()->after('dispatched_at');
            $table->string('dispatch_reference')->nullable()->after('dispatched_to');
            $table->string('payment_method', 32)->nullable()->after('payment_status');
            $table->string('payment_reference')->nullable()->after('payment_method');
        });

        Schema::table('incoming_goods_inspections', function (Blueprint $table) {
            $table->timestamp('labels_applied_at')->nullable()->after('approval_status');
            $table->timestamp('supplier_delivery_counted_at')->nullable()->after('labels_applied_at');
        });
    }

    public function down(): void
    {
        Schema::table('incoming_goods_inspections', function (Blueprint $table) {
            $table->dropColumn(['labels_applied_at', 'supplier_delivery_counted_at']);
        });
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropForeign(['budget_plan_id']);
            $table->dropColumn([
                'direct_order', 'direct_order_reason', 'budget_plan_id', 'dispatched_at', 'dispatched_to',
                'dispatch_reference', 'payment_method', 'payment_reference',
            ]);
        });
        Schema::table('procurement_quotations', function (Blueprint $table) {
            $table->dropColumn(['requested_date', 'available_quantity', 'minimum_order_quantity', 'supporting_documents']);
        });
        Schema::table('procurement_suppliers', function (Blueprint $table) {
            $table->dropColumn(['improvement_requested_at', 'improvement_due_at', 'is_contractor', 'ohs_instructions_acknowledged_at', 'ohs_acknowledgement_reference']);
        });
    }
};
