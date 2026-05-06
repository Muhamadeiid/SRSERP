<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
    |--------------------------------------------------------------------------
    | employees table – all 46 columns from the Excel sheet
    |--------------------------------------------------------------------------
    |
    | Columns map:
    |  1.  id                          → auto PK
    |  2.  ibs_code                    → IBS Code
    |  3.  punch_code                  → Punch Code
    |  4.  rotem_code                  → RotemCode
    |  5.  project_budget              → Project Budget
    |  6.  name                        → English Name
    |  7.  arabic_name                 → Arabic Name
    |  8.  position                    → Position
    |  9.  position_arabic             → Position In Arabic
    | 10.  department                  → derived from position
    | 11.  work_location               → Work Location
    | 12.  city                        → City
    | 13.  address                     → Address
    | 14.  hiring_date                 → Hiring Date
    | 15.  national_id                 → National ID Number
    | 16.  birth_date                  → Birth Date
    | 17.  phone                       → Phone No
    | 18.  another_phone               → Another Phone No
    | 19.  education_type              → Education > Type
    | 20.  education_school            → Education > University/School
    | 21.  education_major             → Education > Major
    | 22.  education_year              → Education > Year
    | 23.  category                    → Category (Blue/White Collar)
    | 24.  military_status             → Military Status
    | 25.  military_serving_days       → Serving Period > Day
    | 26.  military_serving_months     → Serving Period > Month
    | 27.  military_serving_years      → Serving Period > Year
    | 28.  emergency_contact_type      → Emergency Contact Type
    | 29.  emergency_contact_name      → Emergency Contact Name (EN)
    | 30.  emergency_contact_name_ar   → Emergency Contact Name (AR)
    | 31.  emergency_contact_phone     → Emergency Contact Phone No
    | 32.  doc_birth_certificate       → Birth Certificate ✓/✗
    | 33.  doc_edu_certificate         → Edu Certificate ✓/✗
    | 34.  doc_military_certificate    → Military Certificate ✓/✗
    | 35.  doc_criminal_sheet          → Criminal Sheet ✓/✗
    | 36.  doc_national_id             → National ID ✓/✗
    | 37.  doc_social_insurance_print  → Social Insurance Print ✓/✗
    | 38.  doc_personal_photos         → Personal Photos ✓/✗
    | 39.  doc_union_card              → Union Card/Skills Manag Certificate ✓/✗
    | 40.  social_insurance_number     → Social Insurance Number
    | 41.  insurance_status            → Insurance Status
    | 42.  insurance_company           → Insurance Company
    | 43.  form_1                      → Form 1 ✓/✗
    | 44.  insurance_date              → Insurance Date
    | 45.  contract_start              → Date of Last Available Contract > Start
    | 46.  contract_end                → Date of Last Available Contract > End
    | 47.  vacation_form               → Vacation Form (text/date)
    | 48.  sanctions_form              → Sanctions Form
    | 49.  marital_status_form         → Marital Status Form
    | 50.  no_warning_letters          → No of Warning Letters
    | 51.  status                      → HR status (on_site / leave / etc.) – app managed
    |
    */

    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {

            // ── PK ──────────────────────────────────────────
            $table->id();

            // ── Identifiers (cols 2-5) ───────────────────────
            $table->string('ibs_code', 20)->unique()->nullable();
            $table->string('punch_code', 20)->nullable();
            $table->string('rotem_code', 50)->nullable();
            $table->string('project_budget', 100)->nullable();

            // ── Name (cols 6-7) ──────────────────────────────
            $table->string('name', 255);
            $table->string('arabic_name', 255)->nullable();

            // ── Position (cols 8-9) ──────────────────────────
            $table->string('position', 255);
            $table->string('position_arabic', 255)->nullable();

            // ── Job info (col 10-11) ─────────────────────────
            $table->enum('department', ['workshop', 'heavy_maintenance', 'intervention'])
                  ->default('intervention');
            $table->string('work_location', 100)->nullable();

            // ── Address (cols 12-13) ─────────────────────────
            $table->string('city', 100)->nullable();
            $table->text('address')->nullable();

            // ── Dates & Identity (cols 14-18) ────────────────
            $table->date('hiring_date')->nullable();
            $table->string('national_id', 20)->nullable();
            $table->date('birth_date')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('another_phone', 20)->nullable();

            // ── Education (cols 19-22) ───────────────────────
            $table->string('education_type', 100)->nullable();       // Bachelor / Industrial Diploma / etc.
            $table->string('education_school', 255)->nullable();
            $table->string('education_major', 255)->nullable();
            $table->smallInteger('education_year')->unsigned()->nullable();

            // ── Classification (col 23) ──────────────────────
            $table->enum('category', ['Blue Collar', 'White Collar'])->default('Blue Collar');

            // ── Military (cols 24-27) ────────────────────────
            $table->string('military_status', 100)->nullable();       // Complete / Final Exampted / etc.
            $table->unsignedTinyInteger('military_serving_days')->nullable();
            $table->unsignedTinyInteger('military_serving_months')->nullable();
            $table->unsignedTinyInteger('military_serving_years')->nullable();

            // ── Emergency Contact (cols 28-31) ───────────────
            $table->string('emergency_contact_type', 50)->nullable();   // Father / Mother / Wife / Brother …
            $table->string('emergency_contact_name', 255)->nullable();
            $table->string('emergency_contact_name_ar', 255)->nullable();
            $table->string('emergency_contact_phone', 20)->nullable();

            // ── Documents checklist (cols 32-39) ─────────────
            // true = ✓ (present),  false = ✗ (missing)
            $table->boolean('doc_birth_certificate')->default(false);
            $table->boolean('doc_edu_certificate')->default(false);
            $table->boolean('doc_military_certificate')->default(false);
            $table->boolean('doc_criminal_sheet')->default(false);
            $table->boolean('doc_national_id')->default(false);
            $table->boolean('doc_social_insurance_print')->default(false);
            $table->boolean('doc_personal_photos')->default(false);
            $table->boolean('doc_union_card')->default(false);

            // ── Insurance (cols 40-44) ───────────────────────
            $table->string('social_insurance_number', 20)->nullable();
            $table->string('insurance_status', 50)->nullable();         // Insured / Not Insured
            $table->string('insurance_company', 100)->nullable();       // IBS
            $table->boolean('form_1')->default(false);
            $table->date('insurance_date')->nullable();

            // ── Contract (cols 45-46) ────────────────────────
            $table->date('contract_start')->nullable();
            $table->date('contract_end')->nullable();

            // ── HR Forms (cols 47-50) ────────────────────────
            $table->string('vacation_form', 100)->nullable();
            $table->string('sanctions_form', 100)->nullable();
            $table->string('marital_status_form', 100)->nullable();
            $table->unsignedTinyInteger('no_warning_letters')->default(0);

            // ── App-managed status ───────────────────────────
            $table->enum('status', [
                'on_site',
                'annual_leave',
                'cert_expired',
                'suspended',
                'terminated',
                'remote',
            ])->default('on_site');

            // ── Timestamps & Soft Delete ─────────────────────
            $table->timestamps();
            $table->softDeletes();

            // ── Indexes ──────────────────────────────────────
            $table->index('department');
            $table->index('work_location');
            $table->index('status');
            $table->index('category');
            $table->index('hiring_date');
            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
