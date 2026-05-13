<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // longText column to store an optional notes image as a base64 data-URI
        \DB::statement('ALTER TABLE prfs ADD COLUMN notes_image LONGTEXT NULL AFTER notes');
    }

    public function down(): void
    {
        Schema::table('prfs', function (Blueprint $table) {
            $table->dropColumn('notes_image');
        });
    }
};
