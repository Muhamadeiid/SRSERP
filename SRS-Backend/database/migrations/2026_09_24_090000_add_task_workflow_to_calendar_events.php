<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal')->after('type');
            $table->enum('status', ['todo', 'in_progress', 'done'])->default('todo')->after('is_done');
            // Minutes before the start time to remind participants; null = no reminder.
            $table->unsignedSmallInteger('reminder_minutes')->nullable()->after('duration_min');
            $table->json('checklist')->nullable()->after('notes');
            $table->timestamp('completed_at')->nullable()->after('status');
            $table->foreignId('completed_by')->nullable()->after('completed_at')->constrained('users')->nullOnDelete();

            $table->index(['type', 'status']);
        });

        DB::table('calendar_events')->where('is_done', true)->update(['status' => 'done']);
        // Existing timed meetings/interviews keep the old fixed 15-minute reminder.
        DB::table('calendar_events')
            ->whereIn('type', ['meeting', 'interview'])
            ->whereNotNull('event_time')
            ->update(['reminder_minutes' => 15]);
    }

    public function down(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->dropIndex(['type', 'status']);
            $table->dropConstrainedForeignId('completed_by');
            $table->dropColumn(['priority', 'status', 'reminder_minutes', 'checklist', 'completed_at']);
        });
    }
};
