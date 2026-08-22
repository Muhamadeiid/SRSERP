<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('category', 20)->default('sys')->after('type');
            $table->string('priority', 10)->default('info')->after('category');
            $table->string('description', 500)->nullable()->after('body');
            $table->foreignId('sender_user_id')->nullable()->after('description')
                ->constrained('users')->nullOnDelete();
            $table->string('sender_icon', 32)->nullable()->after('sender_user_id');
            $table->string('link')->nullable()->after('sender_icon');
            $table->json('meta')->nullable()->after('data');
            $table->json('actions')->nullable()->after('meta');
            $table->timestamp('read_at')->nullable()->after('read');
            $table->timestamp('dismissed_at')->nullable()->after('read_at');

            $table->index(['user_id', 'read_at'], 'notifications_user_unread_index');
            $table->index(['user_id', 'created_at'], 'notifications_user_created_index');
        });

        // Preserve the legacy body/read values while preparing existing rows for the new API.
        DB::table('notifications')->whereNull('description')->update([
            'description' => DB::raw('body'),
        ]);
        DB::table('notifications')->where('read', true)->whereNull('read_at')->update([
            'read_at' => DB::raw('updated_at'),
        ]);
        DB::table('notifications')->where(function ($query) {
            $query->where('type', 'like', '%leave%')
                ->orWhere('type', 'like', '%amendment%')
                ->orWhere('type', 'like', '%cancellation%');
        })->update(['category' => 'leave']);
        DB::table('notifications')->where(function ($query) {
            $query->where('type', 'like', '%overtime%')->orWhere('type', 'like', '%otr%');
        })->update(['category' => 'ot']);
        DB::table('notifications')->where(function ($query) {
            $query->where('type', 'like', '%task%')->orWhere('type', 'like', '%maintenance%');
        })->update(['category' => 'task']);
        DB::table('notifications')->where('type', 'like', '%meeting%')->update(['category' => 'meeting']);
        DB::table('notifications')->where(function ($query) {
            $query->where('type', 'like', '%resignation%')
                ->orWhere('type', 'like', '%interview%')
                ->orWhere('type', 'like', '%employee%');
        })->update(['category' => 'hr']);
        DB::table('notifications')->where(function ($query) {
            $query->where('type', 'like', '%report%')->orWhere('type', 'like', '%prf%');
        })->update(['category' => 'report']);

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained('users')->cascadeOnDelete();
            $table->boolean('dnd_enabled')->default(false);
            $table->timestamp('dnd_until')->nullable();
            $table->json('channels')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_preferences');

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_user_unread_index');
            $table->dropIndex('notifications_user_created_index');
            $table->dropConstrainedForeignId('sender_user_id');
            $table->dropColumn([
                'category', 'priority', 'description', 'sender_icon', 'link',
                'meta', 'actions', 'read_at', 'dismissed_at',
            ]);
        });
    }
};
