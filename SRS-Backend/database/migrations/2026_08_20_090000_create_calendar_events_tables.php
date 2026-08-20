<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('public_holidays') && ! Schema::hasColumn('public_holidays', 'end_date')) {
            Schema::table('public_holidays', function (Blueprint $table) {
                $table->date('end_date')->nullable()->after('date');
            });
        }

        Schema::create('calendar_events', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['meeting', 'task', 'interview', 'leave']);
            $table->string('title');
            $table->text('notes')->nullable();
            $table->date('event_date');
            $table->time('event_time')->nullable();
            $table->unsignedInteger('duration_min')->nullable();
            $table->boolean('is_all_day')->default(false);
            $table->date('leave_end_date')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_done')->default(false);

            // Recurrence is intentionally finite when recurrence_until is set.
            $table->enum('recurrence_type', ['none', 'daily', 'weekly', 'monthly'])->default('none');
            $table->unsignedSmallInteger('recurrence_interval')->default(1);
            $table->json('recurrence_weekdays')->nullable();
            $table->date('recurrence_until')->nullable();
            $table->timestamps();

            $table->index('event_date');
            $table->index(['type', 'event_date']);
            $table->index(['recurrence_type', 'recurrence_until']);
        });

        Schema::create('calendar_event_participants', function (Blueprint $table) {
            $table->foreignId('event_id')->constrained('calendar_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('role', ['attendee', 'assignee', 'interviewer', 'candidate', 'notifier'])
                ->default('attendee');

            $table->primary(['event_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_event_participants');
        Schema::dropIfExists('calendar_events');

        if (Schema::hasTable('public_holidays') && Schema::hasColumn('public_holidays', 'end_date')) {
            Schema::table('public_holidays', function (Blueprint $table) {
                $table->dropColumn('end_date');
            });
        }
    }
};
