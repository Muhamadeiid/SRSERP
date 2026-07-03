<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lookups', function (Blueprint $table) {
            $table->id();
            $table->string('type', 50);        // 'department', 'location', 'category', 'user_department'
            $table->string('key', 50);         // machine-friendly slug used by app code (e.g. 'cm', 'Kozzika')
            $table->string('label_en', 100);
            $table->string('label_ar', 100)->nullable();
            $table->string('color', 30)->nullable();   // Tailwind palette key, optional
            $table->integer('sort')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['type', 'key']);
            $table->index(['type', 'is_active', 'sort']);
        });

        // Seed employee departments (Workforce values)
        $now = now();
        $employeeDepts = [
            ['cm',              'CM',              'CM',                 'primary',   1],
            ['hm',              'HM',              'HM',                 'orange',    2],
            ['pm',              'PM',              'PM',                 'blue',      3],
            ['warranty',        'Warranty',        'الضمان',             'green',     4],
            ['cm_intervention', 'CM (Intervention)', 'التدخل السريع',    'secondary', 5],
            ['admin',           'Admin',           'الإدارة',             'purple',    6],
        ];
        foreach ($employeeDepts as [$key, $en, $ar, $color, $sort]) {
            DB::table('lookups')->insert([
                'type' => 'department', 'key' => $key, 'label_en' => $en, 'label_ar' => $ar,
                'color' => $color, 'sort' => $sort, 'is_active' => true,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // Seed work locations
        $locations = [
            ['Kozzika',  'Kozzika',  'كوزيكا',   1],
            ['Tura',     'Tura',     'طرة',      2],
            ['Ganz',     'Ganz',     'جانز',     3],
            ['Mainline', 'Mainline', 'الخط الرئيسي', 4],
        ];
        foreach ($locations as [$key, $en, $ar, $sort]) {
            DB::table('lookups')->insert([
                'type' => 'location', 'key' => $key, 'label_en' => $en, 'label_ar' => $ar,
                'sort' => $sort, 'is_active' => true,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // Seed employee categories
        $categories = [
            ['Blue Collar',  'Blue Collar',  'عمالة',       1],
            ['White Collar', 'White Collar', 'إدارية',      2],
        ];
        foreach ($categories as [$key, $en, $ar, $sort]) {
            DB::table('lookups')->insert([
                'type' => 'category', 'key' => $key, 'label_en' => $en, 'label_ar' => $ar,
                'sort' => $sort, 'is_active' => true,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // Seed user roles (display metadata — the DB enum still enforces valid values)
        $roles = [
            ['admin',         'Admin',         'مشرف عام',        'red',    1],
            ['depot_manager', 'Depot Manager', 'مدير المستودع',   'blue',   2],
            ['manager',       'Manager',       'مدير',            'amber',  3],
            ['hr',            'HR',            'موارد بشرية',     'purple', 4],
            ['procurement',   'Procurement',   'مشتريات',         'teal',   5],
            ['ehs',           'EHS',           'بيئة و سلامة',    'green',  6],
            ['staff',         'Staff',         'موظف',            'green',  7],
        ];
        foreach ($roles as [$key, $en, $ar, $color, $sort]) {
            DB::table('lookups')->insert([
                'type' => 'role', 'key' => $key, 'label_en' => $en, 'label_ar' => $ar,
                'color' => $color, 'sort' => $sort, 'is_active' => true,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('lookups');
    }
};
