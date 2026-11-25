<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A PRF can carry several note images. The single notes_image column stays
     * (it keeps the first image), and existing attachments move into the list.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('prfs', 'notes_images')) {
            Schema::table('prfs', function (Blueprint $table) {
                $table->longText('notes_images')->nullable()->after('notes_image');
            });
        }

        DB::table('prfs')
            ->whereNotNull('notes_image')
            ->where('notes_image', '!=', '')
            ->whereNull('notes_images')
            ->select(['id', 'notes_image'])
            ->orderBy('id')
            ->chunkById(50, function ($prfs) {
                foreach ($prfs as $prf) {
                    DB::table('prfs')->where('id', $prf->id)->update(['notes_images' => json_encode([$prf->notes_image])]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('prfs', function (Blueprint $table) {
            $table->dropColumn('notes_images');
        });
    }
};
