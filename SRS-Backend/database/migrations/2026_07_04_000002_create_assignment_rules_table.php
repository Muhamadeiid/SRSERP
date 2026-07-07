<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assignment_rules', function (Blueprint $table) {
            $table->id();
            // What to match on: a department key, or (part of) a position title.
            $table->enum('match_field', ['department', 'position']);
            $table->string('match_value', 150);
            // Where matched employees get assigned.
            $table->foreignId('direct_manager_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('department', 50)->nullable();
            $table->string('work_location', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('priority')->default(0);   // lower = evaluated first; first match wins
            $table->timestamps();

            $table->index(['is_active', 'priority']);
        });

        // Tracks whether an employee's direct manager was set by hand. Rules never
        // override a manual pick, so HR can always make one-off exceptions.
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('manager_manual')->default(false)->after('direct_manager_id');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('manager_manual');
        });
        Schema::dropIfExists('assignment_rules');
    }
};
