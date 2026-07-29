<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('leave_request_archives')) {
            Schema::create('leave_request_archives', function (Blueprint $table) {
                $table->id();
                $table->foreignId('leave_request_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('archived_at');
                $table->timestamps();
                $table->unique(['leave_request_id', 'user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_request_archives');
    }
};
