<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ImportExcelWorkforceSeeder extends Seeder
{
    public function run(): void
    {
        $files = [
            base_path('../scratchpad_excel_data.tsv'),
            base_path('../scratchpad_ganz_data.tsv'),
        ];

        $lines = [];
        foreach ($files as $file) {
            if (file_exists($file)) {
                $tsv = file_get_contents($file);
                $fileLines = array_filter(explode("\n", trim($tsv)));
                $lines = array_merge($lines, $fileLines);
                $this->command->info("Loaded " . count($fileLines) . " rows from " . basename($file));
            }
        }

        $added = 0;
        $updated = 0;
        $skipped = 0;
        $details = [];

        foreach ($lines as $line) {
            $cols = explode("\t", $line);
            if (count($cols) < 9) continue;

            $rowNum      = trim($cols[0] ?? '');
            $ibsCode     = trim($cols[1] ?? '');
            $punchCode   = trim($cols[2] ?? '');
            $rotemCode   = trim($cols[3] ?? '');
            $name        = trim($cols[4] ?? '');
            $arabicName  = trim($cols[5] ?? '');
            $position    = trim($cols[6] ?? '');
            $posArabic   = trim($cols[7] ?? '');
            $workLoc     = trim($cols[8] ?? '');
            $projBudget  = trim($cols[9] ?? '');
            $city        = trim($cols[10] ?? '');
            $address     = trim($cols[11] ?? '');
            $hiringDate  = $this->parseDate(trim($cols[12] ?? ''));
            $nationalId  = trim($cols[13] ?? '');
            $birthDate   = $this->parseDate(trim($cols[14] ?? ''));
            $phone       = trim($cols[15] ?? '');
            $phone2      = trim($cols[16] ?? '');
            $eduType     = trim($cols[17] ?? '');
            $eduSchool   = trim($cols[18] ?? '');
            $eduMajor    = trim($cols[19] ?? '');
            $eduYear     = trim($cols[20] ?? '');
            $category    = trim($cols[21] ?? '');
            $milStatus   = trim($cols[22] ?? '');
            $milYears    = trim($cols[23] ?? '');
            $milMonths   = trim($cols[24] ?? '');
            $milDays     = trim($cols[25] ?? '');

            // Emergency contact (cols 26-29)
            $emType      = trim($cols[26] ?? '');
            $emName      = trim($cols[27] ?? '');
            $emNameAr    = trim($cols[28] ?? '');
            $emPhone     = trim($cols[29] ?? '');

            // Document booleans (cols 30-37): 8 fields
            $docBirth    = $this->parseBool($cols[30] ?? '');
            $docEdu      = $this->parseBool($cols[31] ?? '');
            $docMil      = $this->parseBool($cols[32] ?? '');
            $docCrim     = $this->parseBool($cols[33] ?? '');
            $docNatId    = $this->parseBool($cols[34] ?? '');
            $docSocIns   = $this->parseBool($cols[35] ?? '');
            $docPhotos   = $this->parseBool($cols[36] ?? '');
            $docUnion    = $this->parseBool($cols[37] ?? '');

            // Insurance & contract (cols 38-43)
            $socInsNum   = trim($cols[38] ?? '');
            $insStatus   = trim($cols[39] ?? '');
            $insCompany  = trim($cols[40] ?? '');
            $form1       = $this->parseBool($cols[41] ?? '');
            $insDate     = $this->parseDate(trim($cols[42] ?? ''));
            $contractStart = $this->parseDate(trim($cols[43] ?? ''));
            $contractEnd = $this->parseDate(trim($cols[44] ?? ''));

            if (!$name) continue;

            // Determine department from position
            $dept = $this->mapDepartment($position);

            // Fix IBS code for "Rotem SRS" (supervisors/managers)
            $searchIbs = $ibsCode;
            if ($ibsCode === 'Rotem SRS' || !is_numeric($ibsCode)) {
                $searchIbs = null;
            }

            // Category validation
            if ($category !== 'Blue Collar' && $category !== 'White Collar') {
                $category = 'Blue Collar';
            }

            // Find existing employee
            $emp = null;
            if ($searchIbs) {
                $emp = Employee::where('ibs_code', $searchIbs)->first();
            }
            if (!$emp) {
                // Try matching by punch_code
                if ($punchCode) {
                    $emp = Employee::where('punch_code', $punchCode)
                        ->where(function ($q) use ($name) {
                            // Also match on a portion of the name to avoid false matches
                            $firstName = explode(' ', $name)[0];
                            $q->where('name', 'LIKE', $firstName . '%');
                        })->first();
                }
            }
            if (!$emp && !$searchIbs) {
                // For Rotem SRS entries, try matching by name
                $emp = Employee::where('name', 'LIKE', explode(' ', $name)[0] . ' ' . explode(' ', $name)[1] . '%')->first();
            }

            $data = [
                'name' => $name,
                'arabic_name' => $arabicName ?: null,
                'position' => $position,
                'position_arabic' => $posArabic ?: null,
                'department' => $dept,
                'work_location' => $workLoc ?: null,
                'city' => $city ?: null,
                'address' => $address ?: null,
                'category' => $category,
                'status' => 'on_site',
                'punch_code' => $punchCode ?: null,
                'rotem_code' => $rotemCode ?: null,
                'project_budget' => $projBudget ?: null,
            ];

            if ($searchIbs) {
                $data['ibs_code'] = $searchIbs;
            }

            // Only set optional fields if they have values
            if ($hiringDate) $data['hiring_date'] = $hiringDate;
            if ($nationalId && $nationalId !== '#VALUE!') $data['national_id'] = $nationalId;
            if ($birthDate) $data['birth_date'] = $birthDate;
            if ($phone) $data['phone'] = $phone;
            if ($phone2) $data['another_phone'] = $phone2;
            if ($eduType) $data['education_type'] = $eduType;
            if ($eduSchool) $data['education_school'] = $eduSchool;
            if ($eduMajor) $data['education_major'] = $eduMajor;
            if ($eduYear && is_numeric($eduYear)) $data['education_year'] = (int) $eduYear;
            if ($milStatus) $data['military_status'] = $milStatus;
            if (is_numeric($milDays)) $data['military_serving_days'] = (int) $milDays;
            if (is_numeric($milMonths)) $data['military_serving_months'] = (int) $milMonths;
            if (is_numeric($milYears)) $data['military_serving_years'] = (int) $milYears;
            if ($emType) $data['emergency_contact_type'] = $emType;
            if ($emName) $data['emergency_contact_name'] = $emName;
            if ($emNameAr) $data['emergency_contact_name_ar'] = $emNameAr;
            if ($emPhone) {
                // Take only first phone if multiple separated by -
                $emPhone = trim(explode(' - ', $emPhone)[0]);
                $emPhone = trim(explode('-', $emPhone)[0]);
                $data['emergency_contact_phone'] = substr($emPhone, 0, 20);
            }

            // Doc booleans
            if ($docBirth !== null) $data['doc_birth_certificate'] = $docBirth;
            if ($docEdu !== null) $data['doc_edu_certificate'] = $docEdu;
            if ($docMil !== null) $data['doc_military_certificate'] = $docMil;
            if ($docCrim !== null) $data['doc_criminal_sheet'] = $docCrim;
            if ($docNatId !== null) $data['doc_national_id'] = $docNatId;
            if ($docSocIns !== null) $data['doc_social_insurance_print'] = $docSocIns;
            if ($docPhotos !== null) $data['doc_personal_photos'] = $docPhotos;
            if ($docUnion !== null) $data['doc_union_card'] = $docUnion;

            if ($socInsNum) $data['social_insurance_number'] = $socInsNum;
            if ($insStatus) $data['insurance_status'] = $insStatus;
            if ($insCompany) $data['insurance_company'] = $insCompany;
            if ($form1 !== null) $data['form_1'] = $form1;
            if ($insDate) $data['insurance_date'] = $insDate;
            if ($contractStart) $data['contract_start'] = $contractStart;
            if ($contractEnd) $data['contract_end'] = $contractEnd;

            if ($emp) {
                $emp->update($data);
                $updated++;
                $details[] = "UPDATED #{$emp->id}: {$name} (IBS: {$ibsCode})";
            } else {
                // Set defaults for required fields
                $data['doc_birth_certificate'] = $data['doc_birth_certificate'] ?? false;
                $data['doc_edu_certificate'] = $data['doc_edu_certificate'] ?? false;
                $data['doc_military_certificate'] = $data['doc_military_certificate'] ?? false;
                $data['doc_criminal_sheet'] = $data['doc_criminal_sheet'] ?? false;
                $data['doc_national_id'] = $data['doc_national_id'] ?? false;
                $data['doc_social_insurance_print'] = $data['doc_social_insurance_print'] ?? false;
                $data['doc_personal_photos'] = $data['doc_personal_photos'] ?? false;
                $data['doc_union_card'] = $data['doc_union_card'] ?? false;
                $data['form_1'] = $data['form_1'] ?? false;
                $data['no_warning_letters'] = 0;
                $data['manager_manual'] = false;

                $emp = Employee::create($data);
                $added++;
                $details[] = "ADDED #{$emp->id}: {$name} (IBS: {$ibsCode})";
            }
        }

        $this->command->info("=== Import Complete ===");
        $this->command->info("Added: {$added}");
        $this->command->info("Updated: {$updated}");
        $this->command->info("Skipped: {$skipped}");
        $this->command->info("");
        foreach ($details as $d) {
            $this->command->line($d);
        }

        // Show employees NOT in the Excel (potential resignations)
        $excelIbs = [];
        foreach ($lines as $line) {
            $cols = explode("\t", $line);
            $ibs = trim($cols[1] ?? '');
            if ($ibs && is_numeric($ibs)) $excelIbs[] = $ibs;
        }

        $notInExcel = Employee::whereNotNull('ibs_code')
            ->whereNotIn('ibs_code', $excelIbs)
            ->get(['id', 'name', 'ibs_code', 'position']);

        if ($notInExcel->count()) {
            $this->command->info("");
            $this->command->warn("=== Employees in DB but NOT in Excel ({$notInExcel->count()}) ===");
            foreach ($notInExcel as $e) {
                $this->command->line("  DB #{$e->id}: {$e->name} (IBS: {$e->ibs_code}) - {$e->position}");
            }
        }
    }

    private function mapDepartment(string $position): string
    {
        $pos = strtolower($position);

        if (str_contains($pos, 'intervention')) return 'cm_intervention';
        if (str_contains($pos, 'hm ') || str_contains($pos, 'hm head')) return 'hm';
        if (str_contains($pos, 'cm ') || str_contains($pos, 'cm head')) return 'cm';
        if (str_contains($pos, 'pm ')) return 'pm';
        if (str_contains($pos, 'warranty')) return 'warranty';

        // Admin-type roles
        if (preg_match('/admin|documentation|mmis|procurement|logistics|hr |ehs|store|depot|cleaner|material/i', $position)) {
            return 'admin';
        }

        return 'admin';
    }

    private function parseDate(?string $val): ?string
    {
        if (!$val || $val === '#VALUE!' || $val === '') return null;
        try {
            $dt = \DateTime::createFromFormat('j-M-Y', $val);
            if ($dt) return $dt->format('Y-m-d');
            $dt = \DateTime::createFromFormat('d-M-Y', $val);
            if ($dt) return $dt->format('Y-m-d');
            $dt = \DateTime::createFromFormat('Y-m-d', $val);
            if ($dt) return $dt->format('Y-m-d');
        } catch (\Exception $e) {}
        return null;
    }

    private function parseBool(?string $val): ?bool
    {
        $val = trim($val ?? '');
        if ($val === '√' || $val === '1' || $val === 'true') return true;
        if ($val === '×' || $val === '0' || $val === 'false') return false;
        return null;
    }
}
