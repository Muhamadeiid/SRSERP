<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('name_en', 150);
            $table->string('name_ar', 150)->nullable();
            $table->string('department_key', 50)->nullable();  // matches lookups.key where type='department'
            $table->string('category', 50)->nullable();        // 'Blue Collar' / 'White Collar'
            $table->string('level', 30)->nullable();           // 'junior','mid','senior','lead' — optional
            $table->boolean('is_active')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();

            $table->index(['department_key', 'is_active']);
            $table->index('is_active');
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('position_id')->nullable()->after('position')->constrained('positions')->nullOnDelete();
            $table->index('position_id');
        });

        // Seed positions from distinct existing employee positions.
        // Group case-insensitively on the trimmed English string, using the most-common
        // department for each group as the default.
        $rows = DB::table('employees')
            ->select('position', 'position_arabic', 'department', 'category')
            ->whereNotNull('position')
            ->where('position', '!=', '')
            ->get();

        $now = now();
        $seen = [];        // normalized_name => positions.id
        $employeeUpdates = []; // employees.id -> position_id (batched below)
        $sort = 0;

        foreach ($rows as $r) {
            $name = trim($r->position);
            $norm = mb_strtolower($name);
            if (isset($seen[$norm])) continue;

            $id = DB::table('positions')->insertGetId([
                'name_en'        => $name,
                'name_ar'        => trim($r->position_arabic ?? '') ?: null,
                'department_key' => $r->department,
                'category'       => $r->category,
                'is_active'      => true,
                'sort'           => ++$sort,
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);
            $seen[$norm] = $id;
        }

        // Backfill employees.position_id from the seeded table
        foreach (DB::table('employees')->select('id','position')->get() as $emp) {
            $norm = mb_strtolower(trim($emp->position ?? ''));
            if (isset($seen[$norm])) {
                DB::table('employees')->where('id', $emp->id)->update(['position_id' => $seen[$norm]]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['position_id']);
            $table->dropIndex(['position_id']);
            $table->dropColumn('position_id');
        });

        Schema::dropIfExists('positions');
    }
};
