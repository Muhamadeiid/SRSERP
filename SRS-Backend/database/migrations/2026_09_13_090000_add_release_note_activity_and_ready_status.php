<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store staff prepare the note — pick codes, quantities, fix the item
     * text if the engineer got a name slightly wrong — and then flip the
     * status to "ready_for_approval" so the Material Controller sees the
     * note is ready to sign off. Every edit is logged in
     * release_note_activities so the engineer and everyone else viewing
     * the note can see who touched what and when.
     */
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE release_notes MODIFY COLUMN status
                ENUM('pending','ready_for_approval','released','rejected','closed')
                NOT NULL DEFAULT 'pending'"
        );

        Schema::create('release_note_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('release_note_id')->constrained('release_notes')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            // What happened: created / edited / item_added / item_removed
            //                / marked_ready / released / rejected / reopened
            $table->string('kind', 40);
            // The row number touched, when the change is on a line item.
            $table->unsignedInteger('item_no')->nullable();
            // { field, before, after } for granular edits; free-form for the rest.
            $table->json('details')->nullable();
            $table->timestamps();

            $table->index(['release_note_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('release_note_activities');

        DB::statement(
            "ALTER TABLE release_notes MODIFY COLUMN status
                ENUM('pending','released','rejected','closed')
                NOT NULL DEFAULT 'pending'"
        );
    }
};
