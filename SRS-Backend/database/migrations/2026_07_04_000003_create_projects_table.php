<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20);                       // e.g. EG1, GZ, CML3 — used on forms
            $table->string('name', 100);                      // human-readable, e.g. Cairo Metro Line 3
            $table->string('name_ar', 100)->nullable();
            $table->string('match_prefix', 100)->nullable();  // case-insensitive prefix of employees.project_budget
            $table->boolean('is_default')->default(false);    // fallback when nothing matches
            $table->boolean('is_active')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort']);
        });

        // Seed the two existing hardcoded projects so getProjectCodeAttribute()
        // keeps returning the same values it did before.
        $now = now();
        DB::table('projects')->insert([
            [
                'code'         => 'EG1',
                'name'         => 'Cairo Metro Line 1',
                'name_ar'      => 'خط مترو القاهرة الأول',
                'match_prefix' => 'CML1',
                'is_default'   => true,     // anything that doesn't match another prefix → EG1
                'is_active'    => true,
                'sort'         => 1,
                'created_at'   => $now, 'updated_at' => $now,
            ],
            [
                'code'         => 'GZ',
                'name'         => 'Ganz',
                'name_ar'      => 'جانز',
                'match_prefix' => 'Ganz',
                'is_default'   => false,
                'is_active'    => true,
                'sort'         => 2,
                'created_at'   => $now, 'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
