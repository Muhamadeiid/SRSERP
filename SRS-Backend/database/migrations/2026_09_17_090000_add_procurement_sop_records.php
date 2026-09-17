<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('procurement_suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('supplier_number', 64)->unique();
            $table->string('company_name');
            $table->text('company_address')->nullable();
            $table->string('interface_person')->nullable();
            $table->string('business_type')->nullable();
            $table->string('phone_email')->nullable();
            $table->unsignedInteger('locations_count')->nullable();
            $table->text('specialties')->nullable();
            $table->string('origin')->nullable();
            $table->string('contact_number')->nullable();
            $table->boolean('valid_commercial_registration')->default(false);
            $table->boolean('valid_tax_registration')->default(false);
            $table->boolean('technical_support_available')->default(false);
            $table->boolean('timely_competitive_quotations')->default(false);
            $table->boolean('clear_payment_lead_time')->default(false);
            $table->boolean('clear_warranty_terms')->default(false);
            $table->boolean('ehs_compliant')->default(false);
            $table->string('status', 32)->default('pending');
            $table->decimal('latest_performance_percentage', 5, 2)->nullable();
            $table->unsignedInteger('successful_deliveries')->default(0);
            $table->timestamp('last_evaluated_at')->nullable();
            $table->timestamp('next_evaluation_at')->nullable();
            $table->foreignId('prepared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'company_name']);
        });

        Schema::create('procurement_vendor_evaluations', function (Blueprint $table) {
            $table->id();
            $table->string('evaluation_number', 64)->unique();
            $table->foreignId('supplier_id')->constrained('procurement_suppliers')->cascadeOnDelete();
            $table->date('evaluation_date');
            $table->json('ratings');
            $table->unsignedInteger('grand_total');
            $table->decimal('percentage', 5, 2);
            $table->string('outcome', 32);
            $table->text('notes')->nullable();
            $table->foreignId('prepared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('procurement_quotations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prf_id')->constrained('prfs')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('procurement_suppliers')->nullOnDelete();
            $table->string('reference', 100)->nullable();
            $table->date('received_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('incoterm')->nullable();
            $table->unsignedInteger('lead_time_days')->nullable();
            $table->decimal('price_before_vat', 15, 2)->default(0);
            $table->decimal('vat', 15, 2)->default(0);
            $table->boolean('technical_compliant')->default(false);
            $table->boolean('ehs_compliant')->default(false);
            $table->boolean('selected')->default(false);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['prf_id', 'selected']);
        });

        Schema::create('procurement_budget_plans', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');
            $table->json('items');
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('vat_total', 15, 2)->default(0);
            $table->decimal('withholding_total', 15, 2)->default(0);
            $table->decimal('grand_total', 15, 2)->default(0);
            $table->string('status', 32)->default('draft');
            $table->foreignId('prepared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('depot_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('depot_approved_at')->nullable();
            $table->foreignId('management_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('management_approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->unique(['year', 'month']);
        });

        Schema::create('purchase_order_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('po_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->string('stage', 32);
            $table->string('action', 16);
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('comment')->nullable();
            $table->timestamp('acted_at');
            $table->timestamps();

            $table->index(['po_id', 'stage']);
        });

        Schema::create('incoming_goods_inspection_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('igi_id')->constrained('incoming_goods_inspections')->cascadeOnDelete();
            $table->string('stage', 32);
            $table->string('action', 16);
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('comment')->nullable();
            $table->timestamp('acted_at');
            $table->timestamps();
            $table->index(['igi_id', 'stage']);
        });

        Schema::table('incoming_goods_inspections', function (Blueprint $table) {
            $table->string('approval_status', 32)->default('draft')->after('status');
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->string('approval_status', 32)->default('draft')->after('status');
            $table->boolean('sole_supplier')->default(false)->after('approval_status');
            $table->text('sole_supplier_justification')->nullable()->after('sole_supplier');
            $table->foreignId('selected_quotation_id')->nullable()->after('sole_supplier_justification')
                ->constrained('procurement_quotations')->nullOnDelete();
            $table->string('payment_status', 32)->default('unpaid')->after('selected_quotation_id');
            $table->timestamp('paid_at')->nullable()->after('payment_status');
        });

        Schema::create('procurement_rejected_goods', function (Blueprint $table) {
            $table->id();
            $table->string('rejection_number', 64)->unique();
            $table->foreignId('igi_id')->constrained('incoming_goods_inspections')->cascadeOnDelete();
            $table->date('delivery_date')->nullable();
            $table->string('item_description');
            $table->string('part_number')->nullable();
            $table->decimal('quantity_affected', 12, 3);
            $table->date('rejecting_date');
            $table->text('reason');
            $table->string('status', 32)->default('pending_return');
            $table->foreignId('requester_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('material_controller_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('supplier_acknowledged_at')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('procurement_rejected_goods');
        Schema::table('incoming_goods_inspections', function (Blueprint $table) {
            $table->dropColumn('approval_status');
        });
        Schema::dropIfExists('incoming_goods_inspection_approvals');
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropForeign(['selected_quotation_id']);
            $table->dropColumn([
                'approval_status', 'sole_supplier', 'sole_supplier_justification',
                'selected_quotation_id', 'payment_status', 'paid_at',
            ]);
        });
        Schema::dropIfExists('purchase_order_approvals');
        Schema::dropIfExists('procurement_budget_plans');
        Schema::dropIfExists('procurement_quotations');
        Schema::dropIfExists('procurement_vendor_evaluations');
        Schema::dropIfExists('procurement_suppliers');
    }
};
