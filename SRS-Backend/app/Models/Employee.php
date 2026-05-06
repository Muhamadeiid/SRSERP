<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        // Identifiers
        'ibs_code', 'punch_code', 'rotem_code', 'project_budget',
        // Names
        'name', 'arabic_name',
        // Position
        'position', 'position_arabic', 'department',
        // Location
        'work_location', 'city', 'address',
        // Personal
        'hiring_date', 'national_id', 'birth_date', 'phone', 'another_phone',
        // Education
        'education_type', 'education_school', 'education_major', 'education_year',
        // Classification
        'category',
        // Military
        'military_status', 'military_serving_days', 'military_serving_months', 'military_serving_years',
        // Emergency Contact
        'emergency_contact_type', 'emergency_contact_name', 'emergency_contact_name_ar', 'emergency_contact_phone',
        // Documents (all 8 checkboxes)
        'doc_birth_certificate', 'doc_edu_certificate', 'doc_military_certificate',
        'doc_criminal_sheet', 'doc_national_id', 'doc_social_insurance_print',
        'doc_personal_photos', 'doc_union_card',
        // Insurance
        'social_insurance_number', 'insurance_status', 'insurance_company', 'form_1', 'insurance_date',
        // Contract
        'contract_start', 'contract_end',
        // HR Forms
        'vacation_form', 'sanctions_form', 'marital_status_form', 'no_warning_letters',
        // App status
        'status',
        // E-Signature
        'e_signature',
        // Direct Manager (self-referential → employees.id)
        'direct_manager_id',
        // System User Account (link to users.id)
        'user_id',
        // Manager User Account (link to users.id — set from User Management / OrgChart)
        'user_manager_id',
        // Schedule
        'saturday_group',   // 'A' or 'B' — for regular employees, which Saturday they're off
        'weekly_off_day',   // 0-6 — for intervention employees, their weekly day off
    ];

    protected $appends = ['department_label', 'docs_completed', 'docs_percent', 'project_code'];

    protected $casts = [
        'hiring_date'                 => 'date',
        'birth_date'                  => 'date',
        'insurance_date'              => 'date',
        'contract_start'              => 'date',
        'contract_end'                => 'date',
        // Document flags
        'doc_birth_certificate'       => 'boolean',
        'doc_edu_certificate'         => 'boolean',
        'doc_military_certificate'    => 'boolean',
        'doc_criminal_sheet'          => 'boolean',
        'doc_national_id'             => 'boolean',
        'doc_social_insurance_print'  => 'boolean',
        'doc_personal_photos'         => 'boolean',
        'doc_union_card'              => 'boolean',
        'form_1'                      => 'boolean',
        // Integers
        'education_year'              => 'integer',
        'military_serving_days'       => 'integer',
        'military_serving_months'     => 'integer',
        'military_serving_years'      => 'integer',
        'no_warning_letters'          => 'integer',
        'weekly_off_day'              => 'integer',
    ];

    // ── Scopes ──────────────────────────────────────────────
    public function scopeByDepartment($q, $dept)   { return $q->where('department', $dept); }
    public function scopeByLocation($q, $loc)       { return $q->where('work_location', $loc); }
    public function scopeByStatus($q, $status)      { return $q->where('status', $status); }
    public function scopeByCategory($q, $cat)       { return $q->where('category', $cat); }

    public function scopeSearch($q, $term)
    {
        $term = trim($term);
        if ($term === '') return $q;

        // Split on whitespace → each word must appear somewhere in the record (AND logic).
        // This lets you search by first, second, or third name part freely.
        $words = array_values(array_filter(preg_split('/\s+/u', $term)));

        // For a single word that looks like a code / ID → also check exact-prefix columns
        $singleCode = count($words) === 1;

        return $q->where(function ($root) use ($words, $singleCode, $term) {

            // ── Fast path: ibs_code / national_id prefix match ──────────
            if ($singleCode) {
                $root->orWhere('ibs_code',    'like', "{$term}%")
                     ->orWhere('national_id', 'like', "{$term}%");
            }

            // ── FULLTEXT match on name + arabic_name (MySQL) ─────────────
            // Build boolean-mode query: +word1 +word2 … (all words required)
            $booleanQuery = implode(' ', array_map(fn($w) => "+{$w}*", $words));
            $root->orWhereRaw(
                'MATCH(name, arabic_name) AGAINST(? IN BOOLEAN MODE)',
                [$booleanQuery]
            );

            // ── Fallback LIKE (catches short words < ft_min_word_len) ────
            // Each word must appear in name OR arabic_name
            $root->orWhere(function ($sub) use ($words) {
                foreach ($words as $word) {
                    $like = "%{$word}%";
                    $sub->where(function ($inner) use ($like) {
                        $inner->where('name',         'like', $like)
                              ->orWhere('arabic_name', 'like', $like);
                    });
                }
            });
        });
    }

    /** Employees with at least one missing document */
    public function scopeMissingDocs($q)
    {
        return $q->where(function ($q) {
            $q->where('doc_birth_certificate',      false)
              ->orWhere('doc_edu_certificate',       false)
              ->orWhere('doc_military_certificate',  false)
              ->orWhere('doc_criminal_sheet',        false)
              ->orWhere('doc_national_id',           false)
              ->orWhere('doc_social_insurance_print',false)
              ->orWhere('doc_personal_photos',       false)
              ->orWhere('doc_union_card',            false);
        });
    }

    // ── Accessors ───────────────────────────────────────────
    public function getDepartmentLabelAttribute(): string
    {
        return match ($this->department) {
            'workshop'          => 'Workshop',
            'heavy_maintenance' => 'Heavy Maintenance',
            'intervention'      => 'Intervention',
            'admin'             => 'Admin',
            'engineer'          => 'Engineer',
            null, ''            => '—',
            default             => ucfirst($this->department),
        };
    }

    /** How many of the 8 documents are complete */
    public function getDocsCompletedAttribute(): int
    {
        $flags = [
            'doc_birth_certificate', 'doc_edu_certificate', 'doc_military_certificate',
            'doc_criminal_sheet', 'doc_national_id', 'doc_social_insurance_print',
            'doc_personal_photos', 'doc_union_card',
        ];
        return collect($flags)->filter(fn($f) => $this->$f)->count();
    }

    /** Percentage of docs complete (0-100) */
    public function getDocsPercentAttribute(): int
    {
        return (int) round(($this->docs_completed / 8) * 100);
    }

    // ── Project helpers (Ganz vs CML1) ──────────────────────

    /**
     * Returns the short project code derived from project_budget:
     *   "Ganz…"  → 'GZ'
     *   "CML1…"  → 'EG1'
     *   anything else → 'EG1'  (safe default)
     *
     * Exposed as `project_code` in JSON responses via $appends.
     */
    public function getProjectCodeAttribute(): string
    {
        return $this->isGanz() ? 'GZ' : 'EG1';
    }

    /** Convenience method alias for use in PHP code. */
    public function projectCode(): string
    {
        return $this->getProjectCodeAttribute();
    }

    /** True when this employee belongs to the Ganz project. */
    public function isGanz(): bool
    {
        return str_starts_with(strtolower(trim($this->project_budget ?? '')), 'ganz');
    }

    /** True when this employee belongs to the CML1 project (or no project set). */
    public function isCML1(): bool
    {
        return !$this->isGanz();
    }

    /** Scope: only Ganz employees */
    public function scopeGanz($q)
    {
        return $q->where('project_budget', 'like', 'Ganz%');
    }

    /** Scope: only CML1 employees (project_budget starts with CML1 or is null/other) */
    public function scopeCML1($q)
    {
        return $q->where(function ($sub) {
            $sub->where('project_budget', 'like', 'CML1%')
                ->orWhereNull('project_budget')
                ->orWhere('project_budget', 'not like', 'Ganz%');
        });
    }

    // ── Schedule helpers ────────────────────────────────────

    /** Is this employee in the Intervention department? */
    public function isIntervention(): bool
    {
        return strtolower($this->department ?? '') === 'intervention';
    }

    /**
     * Is a given date a working day for this employee?
     *
     * Regular employees:
     *   - Friday (5) → always off
     *   - Saturday (6) → off if this ISO-week parity matches their saturday_group
     *     (Group A off on even ISO-weeks, Group B off on odd ISO-weeks)
     *
     * Intervention employees:
     *   - Their weekly_off_day (0-6) → off
     *   - Friday is NOT automatically off for them
     */
    public function isWorkingDay(\Carbon\Carbon $date): bool
    {
        $dow = $date->dayOfWeek; // 0=Sun … 6=Sat

        if ($this->isIntervention()) {
            $offDay = $this->weekly_off_day ?? 5; // default Friday if not set
            return $dow !== $offDay;
        }

        // Regular employees
        if ($dow === 5) return false; // Friday always off

        if ($dow === 6) { // Saturday — check rotation group
            $isoWeek = (int) $date->format('W');
            $groupA  = ($isoWeek % 2 === 0); // even week → Group A is off
            if ($this->saturday_group === 'A') return !$groupA;
            if ($this->saturday_group === 'B') return  $groupA;
            return false; // no group assigned → treat as off
        }

        return true; // Sun–Thu always working for regular
    }

    // ── Relationships ────────────────────────────────────────

    /** The direct manager — another Employee record */
    public function directManager(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\Employee::class, 'direct_manager_id');
    }

    /** Employees managed by this employee */
    public function directReports(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(\App\Models\Employee::class, 'direct_manager_id');
    }

    /** The system user account linked to this employee (for login / approvals) */
    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'user_id');
    }

    /** The manager user account assigned to this employee from User Management / OrgChart */
    public function userManager(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'user_manager_id');
    }

    // ── Helpers ─────────────────────────────────────────────
    /** Infer department from position string — returns null if no clear match */
    public static function inferDepartment(?string $position): ?string
    {
        if (!$position) return null;
        $pos = strtolower($position);
        if (preg_match('/\b(hm|heavy|cm)\b/', $pos)) return 'heavy_maintenance';
        if (preg_match('/\b(workshop|admin|store|logistics|procurement|mmis|hr )\b/', $pos)) return 'workshop';
        return null;
    }
}
