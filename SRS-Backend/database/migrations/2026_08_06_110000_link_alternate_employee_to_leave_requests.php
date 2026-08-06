<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('leave_requests') || Schema::hasColumn('leave_requests', 'alternate_employee_id')) {
            return;
        }

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->foreignId('alternate_employee_id')
                ->nullable()
                ->after('alternate_employee_name')
                ->constrained('employees')
                ->nullOnDelete();
        });

        DB::table('leave_requests')
            ->whereNotNull('alternate_employee_name')
            ->where('alternate_employee_name', '<>', '')
            ->orderBy('id')
            ->each(function ($request) {
                $matches = DB::table('employees')
                    ->whereNull('deleted_at')
                    ->where('name', 'like', trim($request->alternate_employee_name) . '%')
                    ->limit(2)
                    ->pluck('id');

                if ($matches->count() === 1) {
                    DB::table('leave_requests')->where('id', $request->id)->update([
                        'alternate_employee_id' => $matches->first(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('leave_requests', 'alternate_employee_id')) {
            Schema::table('leave_requests', function (Blueprint $table) {
                $table->dropConstrainedForeignId('alternate_employee_id');
            });
        }
    }
};
