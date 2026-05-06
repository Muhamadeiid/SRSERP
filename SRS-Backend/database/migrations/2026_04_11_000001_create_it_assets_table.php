<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('it_assets', function (Blueprint $table) {
            $table->id();
            $table->string('item');                          // Category: Mouse, Laptop, etc.
            $table->string('asset_no')->nullable();          // Asset number: MOUSE-01
            $table->string('name');                          // Description
            $table->unsignedInteger('qty')->default(1);      // Quantity
            $table->string('serial_number')->nullable();     // Serial number
            $table->string('purpose')->nullable();           // Office Use, etc.
            $table->string('location')->nullable();          // Physical location
            $table->date('registration_date')->nullable();   // Registration date
            $table->string('account_registration')->nullable(); // Account/registration no
            $table->string('user_name')->nullable();         // User name
            $table->string('managing_staff')->nullable();    // Managing staff
            $table->string('maintenance_frequency')->nullable(); // Quarterly, Monthly, etc.
            $table->string('activity')->nullable();          // Use in Office, etc.
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('it_assets');
    }
};
