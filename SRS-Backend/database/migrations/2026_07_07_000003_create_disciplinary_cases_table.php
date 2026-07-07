<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('disciplinary_cases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('violation_type', 80);
            $table->unsignedInteger('occurrence_no')->default(1);
            $table->date('incident_date');
            $table->string('location', 120)->nullable();
            $table->string('reported_by', 120)->nullable();
            $table->string('witnesses', 255)->nullable();
            $table->text('description');
            $table->text('employee_statement')->nullable();
            $table->string('action_taken', 80)->default('written_warning');
            $table->date('action_date')->nullable();
            $table->string('status', 40)->default('approved');
            $table->text('hr_notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'violation_type', 'status']);
            $table->index(['incident_date', 'status']);
        });

        $now = now();
        $types = [
            ['attendance_delay', 'Repeated Late Attendance', 'orange', 1],
            ['absence_without_permission', 'Absence Without Permission', 'red', 2],
            ['safety_violation', 'Safety Violation', 'amber', 3],
            ['misconduct', 'Misconduct', 'purple', 4],
            ['asset_damage', 'Asset Damage / Loss', 'blue', 5],
            ['refusal_of_instruction', 'Refusal of Instruction', 'gray', 6],
        ];

        foreach ($types as [$key, $label, $color, $sort]) {
            DB::table('lookups')->updateOrInsert(
                ['type' => 'disciplinary_violation', 'key' => $key],
                [
                    'label_en' => $label,
                    'label_ar' => null,
                    'color' => $color,
                    'sort' => $sort,
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('disciplinary_cases');
        DB::table('lookups')->where('type', 'disciplinary_violation')->delete();
    }
};
