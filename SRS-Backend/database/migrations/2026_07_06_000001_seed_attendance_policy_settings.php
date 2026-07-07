<?php

use App\Services\AttendancePolicy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        foreach (AttendancePolicy::DEFAULTS as $key => $value) {
            DB::table('system_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $value, 'created_at' => $now, 'updated_at' => $now]
            );
        }
    }

    public function down(): void
    {
        DB::table('system_settings')
            ->whereIn('key', array_keys(AttendancePolicy::DEFAULTS))
            ->delete();
    }
};
