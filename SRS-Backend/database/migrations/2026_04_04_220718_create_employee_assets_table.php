<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_assets', function (Blueprint $table) {
            $table->id();

            $table->foreignId('employee_id')
                  ->constrained('employees')
                  ->onDelete('cascade');

            // Which department issued this asset
            $table->enum('issuing_department', [
                'EHS',
                'Corrective Maintenance',
                'Preventive Maintenance',
                'Inventory',
                'IT',
                'HR',
                'Other',
            ]);

            // Asset details
            $table->string('asset_name');           // e.g. Laptop, Hard Hat, Multimeter
            $table->string('asset_code')->nullable(); // serial / barcode
            $table->string('asset_category')->nullable(); // PPE / Tool / Device / Uniform / Vehicle / Other

            // Lifecycle
            $table->date('received_date');
            $table->date('return_date')->nullable();

            $table->enum('condition', ['Good', 'Damaged', 'Lost'])->default('Good');
            $table->enum('status', ['Active', 'Returned'])->default('Active');

            $table->text('notes')->nullable();

            $table->foreignId('created_by')
                  ->nullable()
                  ->constrained('users');

            $table->timestamps();

            $table->index('employee_id');
            $table->index('status');
            $table->index('issuing_department');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_assets');
    }
};
