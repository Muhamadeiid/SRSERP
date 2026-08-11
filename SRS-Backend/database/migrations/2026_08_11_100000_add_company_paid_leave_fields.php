<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->boolean('company_paid')->default(false)->after('paid')->index();
            $table->string('company_paid_purpose', 40)->nullable()->after('purpose');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropIndex(['company_paid']);
            $table->dropColumn(['company_paid', 'company_paid_purpose']);
        });
    }
};
