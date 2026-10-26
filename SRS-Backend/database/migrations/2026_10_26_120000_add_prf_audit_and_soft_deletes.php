<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prfs', function (Blueprint $table) {
            $table->string('deleted_prf_number')->nullable()->after('prf_number');
            $table->foreignId('deleted_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->softDeletes();
        });

        Schema::create('prf_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prf_id')->constrained('prfs')->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 50);
            $table->json('changes')->nullable();
            $table->timestamps();

            $table->index(['prf_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prf_activities');

        Schema::table('prfs', function (Blueprint $table) {
            $table->dropForeign(['deleted_by']);
            $table->dropColumn(['deleted_prf_number', 'deleted_by', 'deleted_at']);
        });
    }
};
