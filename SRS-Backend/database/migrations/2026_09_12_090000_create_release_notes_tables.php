<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('release_notes', function (Blueprint $table) {
            $table->id();
            $table->string('prn_number', 64)->unique();
            $table->date('date')->nullable();

            // Header — Type / Status checkboxes on the paper form
            $table->enum('type', ['pm', 'cm'])->nullable();
            $table->enum('plan_status', ['plan', 'over_plan'])->nullable();
            $table->string('over_plan_reason', 500)->nullable();

            // Header — second band
            $table->string('trainset_asset_name', 255)->nullable();
            $table->string('work_order', 255)->nullable();

            // Footer band — "Upon Request of Eng"
            $table->foreignId('requested_by_employee_id')->nullable()
                  ->constrained('employees')->nullOnDelete();
            $table->string('requested_by_name', 255)->nullable();
            $table->string('requested_by_title', 255)->nullable();
            $table->date('requested_by_date')->nullable();

            // Footer band — "Inventory Responsibility" (fixed inventory specialist)
            $table->foreignId('inventory_specialist_employee_id')->nullable()
                  ->constrained('employees')->nullOnDelete();
            $table->string('inventory_specialist_name', 255)->nullable();
            $table->string('inventory_specialist_title', 255)->nullable();
            $table->date('inventory_specialist_date')->nullable();

            // pending  — raised by the requesting engineer, waiting on the store
            // released — store keeper has filled in and issued the parts
            // rejected — store keeper turned the request down
            // closed   — note archived
            $table->enum('status', ['pending', 'released', 'rejected', 'closed'])->default('pending');
            // The store keeper's note back to the requester — why it was
            // rejected, or what was short-issued.
            $table->string('store_remark', 500)->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index('date');
            $table->index('status');
        });

        Schema::create('release_note_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('release_note_id')->constrained('release_notes')->cascadeOnDelete();
            $table->unsignedInteger('no');
            $table->string('code', 100)->nullable();
            $table->string('item_name', 500)->nullable();
            $table->string('unit', 50)->nullable();
            // What the engineer asked for; qty_released is what the store issued.
            $table->decimal('qty_requested', 12, 2)->nullable();
            $table->decimal('qty_released', 12, 2)->nullable();
            $table->decimal('qty_returned', 12, 2)->nullable();
            $table->decimal('actual_qty', 12, 2)->nullable();
            $table->string('check_type', 100)->nullable();

            // Receiver is looked up from the employee master list; the name and
            // title are snapshotted so a later HR change cannot rewrite history.
            $table->foreignId('receiver_employee_id')->nullable()
                  ->constrained('employees')->nullOnDelete();
            $table->string('receiver_name', 255)->nullable();
            $table->string('receiver_title', 255)->nullable();

            $table->timestamps();
            $table->index('release_note_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('release_note_items');
        Schema::dropIfExists('release_notes');
    }
};
