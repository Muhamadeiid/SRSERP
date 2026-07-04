<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('issuing_sources', function (Blueprint $table) {
            $table->id();
            $table->string('key', 50)->unique();      // ehs, it, hr, cm, pm, inventory, other
            $table->string('label_en', 100);
            $table->string('label_ar', 100)->nullable();
            // The person who represents this source on the clearance form.
            // manager_user_id lets us pick a live User (with their signature/role);
            // manager_name is a free-text override for legacy names or vendors.
            $table->foreignId('manager_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('manager_name', 150)->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort']);
        });

        $now = now();
        $rows = [
            ['ehs',        'EHS',                     'الصحة والسلامة والبيئة', 1],
            ['it',         'IT',                      'تكنولوجيا المعلومات',    2],
            ['hr',         'HR',                      'الموارد البشرية',        3],
            ['inventory',  'Inventory',               'المخازن',                4],
            ['cm',         'Corrective Maintenance',  'الصيانة التصحيحية',      5],
            ['pm',         'Preventive Maintenance',  'الصيانة الوقائية',       6],
            ['other',      'Other',                   'أخرى',                   7],
        ];
        foreach ($rows as [$key, $en, $ar, $sort]) {
            DB::table('issuing_sources')->insert([
                'key' => $key, 'label_en' => $en, 'label_ar' => $ar,
                'is_active' => true, 'sort' => $sort,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('issuing_sources');
    }
};
