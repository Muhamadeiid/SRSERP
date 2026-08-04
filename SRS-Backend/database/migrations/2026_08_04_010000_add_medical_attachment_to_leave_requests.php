<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->string('medical_attachment_path')->nullable()->after('purpose');
            $table->string('medical_attachment_name')->nullable()->after('medical_attachment_path');
            $table->string('medical_attachment_mime', 100)->nullable()->after('medical_attachment_name');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn(['medical_attachment_path', 'medical_attachment_name', 'medical_attachment_mime']);
        });
    }
};
