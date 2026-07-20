<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    // ── GET /api/employees/autocomplete — open to all roles (leave request search)
    public function autocomplete(Request $request): JsonResponse
    {
        $q = Employee::active()->select('id', 'name', 'arabic_name', 'position', 'department', 'work_location', 'ibs_code');
        if ($request->filled('search'))
            $q->search($request->search);
        return response()->json($q->orderBy('name')->limit(10)->get());
    }

    // ── GET /api/employees ─────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $q = Employee::query();

        // Workforce filter — active (default), ex, or all
        $view = $request->get('view', 'active');
        if ($view === 'ex')      $q->exEmployees();
        elseif ($view !== 'all') $q->active();

        if ($request->filled('department') && $request->department !== 'all')
            $q->byDepartment($request->department);
        if ($request->filled('location') && $request->location !== 'all')
            $q->byLocation($request->location);
        if ($request->filled('project') && $request->project !== 'all')
            $q->project($request->project);
        if ($request->filled('status') && $request->status !== 'all')
            $q->byStatus($request->status);
        if ($request->filled('category') && $request->category !== 'all')
            $q->byCategory($request->category);
        if ($request->filled('search'))
            $q->search($request->search);

        $sortBy  = $request->get('sort_by', 'id');
        $sortDir = $request->get('sort_dir', 'asc');
        $perPage = (int) $request->get('per_page', 12);

        $result = $q->with('directManager:id,name,position,user_id,e_signature')->orderBy($sortBy, $sortDir)->paginate($perPage);

        return response()->json([
            'data'       => $result->items(),
            'pagination' => [
                'total'        => $result->total(),
                'per_page'     => $result->perPage(),
                'current_page' => $result->currentPage(),
                'last_page'    => $result->lastPage(),
                'from'         => $result->firstItem(),
                'to'           => $result->lastItem(),
            ],
        ]);
    }

    // ── GET /api/employees/org-chart ───────────────────────
    public function orgChart(): JsonResponse
    {
        $employees = Employee::active()->select(
                'employees.id','employees.name','employees.position',
                'employees.department','employees.direct_manager_id',
                'employees.status','employees.work_location',
                'users.role as user_role'
            )
            ->leftJoin('users', 'users.id', '=', 'employees.user_id')
            ->orderBy('employees.name')
            ->get();

        return response()->json($employees);
    }

    // ── PUT /api/employees/{id}/manager ────────────────────
    public function updateManager(Request $request, Employee $employee): JsonResponse
    {
        $managerId = $request->input('direct_manager_id'); // null = remove manager

        // Prevent self-assignment
        if ($managerId && (int)$managerId === $employee->id) {
            return response()->json(['message' => 'Employee cannot be their own manager'], 422);
        }
        if ($managerId && $this->managerAssignmentCreatesCycle($employee->id, (int) $managerId)) {
            return response()->json(['message' => 'This manager is already under the selected employee. Choose another manager.'], 422);
        }

        // Picking a manager in the org chart is a manual override; clearing it
        // hands the employee back to the assignment rules.
        if ($managerId) {
            $employee->update(['direct_manager_id' => $managerId, 'manager_manual' => true]);
        } else {
            $employee->update(['direct_manager_id' => null, 'manager_manual' => false]);
            \App\Services\AssignmentRuleService::applyToEmployee($employee->fresh());
        }

        $employee->refresh()->load('directManager:id,name,position,user_id,e_signature');

        return response()->json($employee);
    }

    // ── GET /api/employees/stats ────────────────────────────
    public function stats(Request $request): JsonResponse
    {
        $employees = Employee::query();
        $view = $request->get('view', 'active');
        if ($view === 'ex') $employees->exEmployees();
        elseif ($view !== 'all') $employees->active();

        return response()->json([
            'total'          => (clone $employees)->count(),
            'by_department'  => (clone $employees)->select('department', DB::raw('count(*) as count'))
                                        ->groupBy('department')->pluck('count', 'department'),
            'by_location'    => (clone $employees)->select('work_location', DB::raw('count(*) as count'))
                                        ->groupBy('work_location')->pluck('count', 'work_location'),
            'by_status'      => (clone $employees)->select('status', DB::raw('count(*) as count'))
                                        ->groupBy('status')->pluck('count', 'status'),
            'by_category'    => (clone $employees)->select('category', DB::raw('count(*) as count'))
                                        ->groupBy('category')->pluck('count', 'category'),
            'locations'      => (clone $employees)->distinct()->pluck('work_location')->filter()->sort()->values(),
            'missing_docs'   => (clone $employees)->missingDocs()->count(),
        ]);
    }

    // ── GET /api/employees/{id} ─────────────────────────────
    public function show(Employee $employee): JsonResponse
    {
        $employee->append(['department_label', 'docs_completed', 'docs_percent']);

        // Walk up the chain to find the first ancestor with a manager-level user account.
        // This means supervisors (no user account) are skipped and the signing engineer appears
        // on leave forms, while the org chart tree still reflects the full hierarchy.
        $signingManager = null;
        $managerId      = $employee->direct_manager_id;
        $visited        = [];
        $managerRoles   = ['manager', 'admin', 'depot_manager'];

        while ($managerId && !in_array($managerId, $visited)) {
            $visited[]  = $managerId;
            $ancestor   = Employee::active()->select('id','name','position','user_id','direct_manager_id','e_signature')
                            ->with('user:id,role')
                            ->find($managerId);
            if (!$ancestor) break;

            $role = $ancestor->user?->role;
            if (in_array($role, $managerRoles)) {
                $signingManager            = $ancestor;
                $signingManager->user_role = $role;
                unset($signingManager->user);
                break;
            }
            $managerId = $ancestor->direct_manager_id;
        }

        $employee->setRelation('directManager', $signingManager);

        return response()->json($employee);
    }

    // ── POST /api/employees ─────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $data = $this->normalizeFields($request->all());
        $v = Validator::make($data, $this->rules());
        if ($v->fails()) return response()->json(['errors' => $v->errors()], 422);

        // A manager picked directly on the form counts as a manual override.
        if (!empty($data['direct_manager_id'])) {
            $data['manager_manual'] = true;
        }

        $employee = Employee::create($data);

        // Otherwise auto-assign via the assignment rules.
        if (!$employee->manager_manual) {
            \App\Services\AssignmentRuleService::applyToEmployee($employee, null, [
                'preserve_department' => array_key_exists('department', $data) && $data['department'] !== null && $data['department'] !== '',
                'preserve_location' => array_key_exists('work_location', $data) && $data['work_location'] !== null && $data['work_location'] !== '',
            ]);
        }

        return response()->json($employee->fresh(), 201);
    }

    // ── PUT /api/employees/{id} ─────────────────────────────
    public function update(Request $request, Employee $employee): JsonResponse
    {
        $data = $this->normalizeFields($request->all());
        $v = Validator::make($data, $this->rules($employee->id));
        if ($v->fails()) return response()->json(['errors' => $v->errors()], 422);

        // An explicit manager pick on the form is a manual override.
        if (array_key_exists('direct_manager_id', $data)) {
            $data['manager_manual'] = !empty($data['direct_manager_id']);
            if (!empty($data['direct_manager_id'])) {
                $managerId = (int) $data['direct_manager_id'];
                if ($managerId === $employee->id || $this->managerAssignmentCreatesCycle($employee->id, $managerId)) {
                    return response()->json(['message' => 'This direct manager selection would break the organization chart hierarchy.'], 422);
                }
            }
        }

        $employee->update($data);

        // Position/department may have changed — re-apply rules unless manual.
        if (!$employee->manager_manual) {
            \App\Services\AssignmentRuleService::applyToEmployee($employee->fresh(), null, [
                'preserve_department' => array_key_exists('department', $data) && $data['department'] !== null && $data['department'] !== '',
                'preserve_location' => array_key_exists('work_location', $data) && $data['work_location'] !== null && $data['work_location'] !== '',
            ]);
        }

        return response()->json($employee->fresh());
    }

    public function bulkSaturdayGroup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'integer|exists:employees,id',
            'saturday_group' => 'required|in:A,B',
        ]);

        $ids = array_values(array_unique($data['employee_ids']));

        $ids = Employee::active()->whereIn('id', $ids)->pluck('id')->all();
        Employee::active()->whereIn('id', $ids)->update([
            'saturday_group' => $data['saturday_group'],
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'updated' => count($ids),
            'data' => Employee::active()->whereIn('id', $ids)->get(),
        ]);
    }

    public function bulkDirectManager(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'integer|exists:employees,id',
            'direct_manager_id' => 'required|integer|exists:employees,id',
        ]);

        $ids = array_values(array_unique($data['employee_ids']));
        $managerId = (int) $data['direct_manager_id'];

        if (!Employee::active()->whereKey($managerId)->exists()) {
            return response()->json(['message' => 'The selected manager is not an active employee.'], 422);
        }
        $ids = Employee::active()->whereIn('id', $ids)->pluck('id')->all();

        if (in_array($managerId, $ids, true)) {
            return response()->json([
                'message' => 'The selected manager cannot be assigned as their own direct manager.',
            ], 422);
        }
        foreach ($ids as $employeeId) {
            if ($this->managerAssignmentCreatesCycle((int) $employeeId, $managerId)) {
                $employee = Employee::find($employeeId);
                return response()->json([
                    'message' => 'Cannot assign this manager because it would place ' . ($employee?->name ?? 'an employee') . ' above their own manager.',
                ], 422);
            }
        }

        Employee::active()->whereIn('id', $ids)->update([
            'direct_manager_id' => $managerId,
            'manager_manual' => true,
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'updated' => count($ids),
            'data' => Employee::active()->whereIn('id', $ids)
                ->with('directManager:id,name,position,user_id,e_signature')
                ->get(),
        ]);
    }

    private function normalizeFields(array $data): array
    {
        if (isset($data['department']) && $data['department'] !== null) {
            $data['department'] = strtolower($data['department']);
        }
        if (($data['saturday_group'] ?? null) === '') {
            $data['saturday_group'] = null;
        }
        if (($data['weekly_off_day'] ?? null) === '') {
            $data['weekly_off_day'] = null;
        }
        return $data;
    }

    // ── DELETE /api/employees/{id} ──────────────────────────
    private function managerAssignmentCreatesCycle(int $employeeId, int $managerId): bool
    {
        $visited = [];
        $currentId = $managerId;

        while ($currentId && !in_array($currentId, $visited, true)) {
            if ($currentId === $employeeId) {
                return true;
            }

            $visited[] = $currentId;
            $currentId = (int) (Employee::whereKey($currentId)->value('direct_manager_id') ?? 0);
        }

        return false;
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $employee->delete();
        return response()->json(['message' => 'Deleted']);
    }

    // ── POST /api/employees/import ──────────────────────────
    public function import(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);

        try {
            $spreadsheet = IOFactory::load($request->file('file')->getPathname());
            $sheet       = $spreadsheet->getActiveSheet();
            $rows        = $sheet->toArray(null, true, true, true);

            // ── Detect header row ──────────────────────────
            $headers = [];
            $data    = [];
            $found   = false;

            foreach ($rows as $row) {
                $vals = array_values(array_map(fn($v) => strtolower(trim((string)$v)), $row));
                if (!$found) {
                    // Header row contains 'english name' or 'name'
                    if (in_array('english name', $vals) || in_array('name', $vals)) {
                        $headers = $vals;
                        $found   = true;
                    }
                } else {
                    $raw = array_values($row);
                    if (count($raw) === count($headers)) {
                        $data[] = array_combine($headers, $raw);
                    }
                }
            }

            $imported = 0;
            $errors   = [];

            DB::transaction(function () use ($data, &$imported, &$errors) {
                foreach ($data as $i => $row) {
                    try {
                        $mapped = $this->mapRow($row);
                        if (empty($mapped['name'])) continue;

                        if ($mapped['ibs_code']) {
                            Employee::updateOrCreate(
                                ['ibs_code' => $mapped['ibs_code']],
                                $mapped
                            );
                        } else {
                            $existing = Employee::where('name', $mapped['name'])->first();
                            if ($existing) {
                                $existing->update($mapped);
                            } else {
                                Employee::create(array_merge($mapped, [
                                    'doc_birth_certificate' => $mapped['doc_birth_certificate'] ?? false,
                                    'doc_edu_certificate' => $mapped['doc_edu_certificate'] ?? false,
                                    'doc_military_certificate' => $mapped['doc_military_certificate'] ?? false,
                                    'doc_criminal_sheet' => $mapped['doc_criminal_sheet'] ?? false,
                                    'doc_national_id' => $mapped['doc_national_id'] ?? false,
                                    'doc_social_insurance_print' => $mapped['doc_social_insurance_print'] ?? false,
                                    'doc_personal_photos' => $mapped['doc_personal_photos'] ?? false,
                                    'doc_union_card' => $mapped['doc_union_card'] ?? false,
                                    'form_1' => $mapped['form_1'] ?? false,
                                    'no_warning_letters' => $mapped['no_warning_letters'] ?? 0,
                                    'manager_manual' => false,
                                ]));
                            }
                        }
                        $imported++;
                    } catch (\Throwable $e) {
                        $errors[] = "Row " . ($i + 2) . ": " . $e->getMessage();
                    }
                }
            });

            return response()->json([
                'imported' => $imported,
                'errors'   => $errors,
                'message'  => "Imported {$imported} employees" . ($errors ? ' with ' . count($errors) . ' errors' : ''),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Import failed: ' . $e->getMessage()], 500);
        }
    }

    // ── GET /api/employees/export ───────────────────────────
    public function export(Request $request): StreamedResponse
    {
        $q = Employee::query();
        $view = $request->get('view', 'active');
        if ($view === 'ex') $q->exEmployees();
        elseif ($view !== 'all') $q->active();
        if ($request->filled('department') && $request->department !== 'all')
            $q->byDepartment($request->department);
        if ($request->filled('location') && $request->location !== 'all')
            $q->byLocation($request->location);

        $employees = $q->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Employees');

        // ── Headers ───────────────────────────────────────
        $cols = $this->excelColumns();
        foreach ($cols as $ci => $label) {
            $sheet->setCellValue([$ci + 1, 1], $label);
        }

        // Style header
        $lastColLetter = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(count($cols));
        $sheet->getStyle("A1:{$lastColLetter}1")->applyFromArray([
            'font'      => ['bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 10],
            'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1B4332']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
        ]);
        $sheet->getRowDimension(1)->setRowHeight(22);

        // ── Data rows ─────────────────────────────────────
        $tick = fn($v) => $v ? '✓' : '✗';

        foreach ($employees as $ri => $e) {
            $row = $ri + 2;
            $values = [
                $ri + 1,                                // #
                $e->ibs_code,                           // IBS Code
                $e->punch_code,                         // Punch Code
                $e->rotem_code,                         // RotemCode
                $e->project_budget,                     // Project Budget
                $e->name,                               // English Name
                $e->arabic_name,                        // Arabic Name
                $e->position,                           // Position
                $e->position_arabic,                    // Position Arabic
                $e->department_label,                   // Department
                $e->work_location,                      // Work Location
                $e->saturday_group,                     // Saturday Group
                $e->weekly_off_day !== null ? $this->weekdayLabel((int) $e->weekly_off_day) : null, // Weekly Off Day
                $e->city,                               // City
                $e->address,                            // Address
                $e->hiring_date?->format('d-M-Y'),      // Hiring Date
                $e->national_id,                        // National ID
                $e->birth_date?->format('d-M-Y'),       // Birth Date
                $e->phone,                              // Phone
                $e->another_phone,                      // Another Phone
                $e->education_type,                     // Education Type
                $e->education_school,                   // School
                $e->education_major,                    // Major
                $e->education_year,                     // Year
                $e->category,                           // Category
                $e->military_status,                    // Military Status
                $e->military_serving_days,              // Days
                $e->military_serving_months,            // Months
                $e->military_serving_years,             // Years
                $e->emergency_contact_type,             // EC Type
                $e->emergency_contact_name,             // EC Name EN
                $e->emergency_contact_name_ar,          // EC Name AR
                $e->emergency_contact_phone,            // EC Phone
                $tick($e->doc_birth_certificate),       // Doc Birth Cert
                $tick($e->doc_edu_certificate),         // Doc Edu Cert
                $tick($e->doc_military_certificate),    // Doc Military Cert
                $tick($e->doc_criminal_sheet),          // Doc Criminal Sheet
                $tick($e->doc_national_id),             // Doc National ID
                $tick($e->doc_social_insurance_print),  // Doc Social Insurance
                $tick($e->doc_personal_photos),         // Doc Photos
                $tick($e->doc_union_card),              // Doc Union Card
                $e->social_insurance_number,            // Social Insurance No
                $e->insurance_status,                   // Insurance Status
                $e->insurance_company,                  // Insurance Company
                $tick($e->form_1),                      // Form 1
                $e->insurance_date?->format('d-M-Y'),   // Insurance Date
                $e->contract_start?->format('d-M-Y'),   // Contract Start
                $e->contract_end?->format('d-M-Y'),     // Contract End
                $e->vacation_form,                      // Vacation Form
                $e->sanctions_form,                     // Sanctions Form
                $e->marital_status_form,                // Marital Status Form
                $e->no_warning_letters,                 // Warning Letters
            ];

            foreach ($values as $ci => $val) {
                $sheet->setCellValue([$ci + 1, $row], $val ?? '');
            }

            // Alternate row colors
            if ($ri % 2 === 0) {
                $sheet->getStyle("A{$row}:{$lastColLetter}{$row}")
                      ->getFill()->setFillType(Fill::FILL_SOLID)
                      ->getStartColor()->setRGB('F0FDF4');
            }
        }

        // Auto-size columns
        for ($c = 1; $c <= count($cols); $c++) {
            $sheet->getColumnDimension(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($c))->setAutoSize(true);
        }

        $writer   = new Xlsx($spreadsheet);
        $filename = 'SRS_Employees_' . now()->format('Y-m-d') . '.xlsx';

        return response()->streamDownload(
            fn() => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    // ── Private helpers ─────────────────────────────────────

    /** Map one Excel row (keyed by lowercase header) to Employee fillable array */
    private function mapRow(array $r): array
    {
        $g  = fn($keys) => trim((string) collect($keys)->map(fn($k) => $r[$k] ?? '')->first(fn($v) => $v !== ''));
        $b  = fn($v) => strtolower(trim((string) $v)) === '√' || $v === true || $v === 1;
        $d  = function ($v) {
            if (!$v) return null;
            try { return \Carbon\Carbon::parse($v)->format('Y-m-d'); } catch (\Throwable) { return null; }
        };

        $pos  = $g(['position']);
        $dept = $g(['department']) ?: null;

        if (!$dept && $pos) {
            $dept = self::departmentFromPosition($pos);
        }

        $ibsCode = $g(['ibs code', 'ibscode']);
        if ($ibsCode && !is_numeric($ibsCode)) {
            $ibsCode = null;
        }

        $ecPhone = $g(['emergency contact phone no', 'ec phone']);
        if ($ecPhone && str_contains($ecPhone, ' - ')) {
            $ecPhone = trim(explode(' - ', $ecPhone)[0]);
        }
        if ($ecPhone) $ecPhone = substr($ecPhone, 0, 20);

        return [
            'ibs_code'                   => $ibsCode,
            'punch_code'                 => $this->cleanPunchCode($g(['punch code', 'punchcode'])),
            'rotem_code'                 => $g(['contract', 'rotemcode', 'rotem code']),
            'project_budget'             => $g(['project budget']),
            'name'                       => $g(['english name', 'name']),
            'arabic_name'                => $g(['arabic name']),
            'position'                   => $pos,
            'position_arabic'            => $g(['position in arabic']),
            'department'                 => $dept,
            'work_location'              => $g(['work location']),
            'saturday_group'             => $this->cleanSaturdayGroup($g(['saturday group', 'saturday grp'])),
            'weekly_off_day'             => $this->cleanWeeklyOffDay($g(['weekly off day', 'day off'])),
            'city'                       => $g(['city']),
            'address'                    => $g(['address']),
            'hiring_date'                => $d($g(['hiring date'])),
            'national_id'                => $g(['national id number', 'national id']),
            'birth_date'                 => $d($g(['birth date'])),
            'phone'                      => $g(['phone no', 'phone']),
            'another_phone'              => $g(['another phone no', 'another phone']),
            'education_type'             => $g(['education category', 'type', 'education type']),
            'education_school'           => $g(['university/school', 'university school', 'school/university']),
            'education_major'            => $g(['major']),
            'education_year'             => (int) $g(['year', 'grad year']) ?: null,
            'category'                   => $g(['category']) ?: 'Blue Collar',
            'military_status'            => $g(['military status']),
            'military_serving_days'      => (int) $g(['day', 'mil. days']) ?: null,
            'military_serving_months'    => (int) $g(['month', 'mil. months']) ?: null,
            'military_serving_years'     => (int) $g(['year.1', 'mil. years']) ?: null,
            'emergency_contact_type'     => $g(['emergency contact type', 'ec type']),
            'emergency_contact_name'     => $g(['emergency contact name', 'ec name']),
            'emergency_contact_name_ar'  => $g(['emergency contact arabic name', 'ec name (ar)']),
            'emergency_contact_phone'    => $ecPhone,
            'doc_birth_certificate'      => $b($g(['birth certificate', 'birth cert'])),
            'doc_edu_certificate'        => $b($g(['edu certificate', 'edu cert'])),
            'doc_military_certificate'   => $b($g(['military certificate', 'military cert'])),
            'doc_criminal_sheet'         => $b($g(['creminal sheet', 'criminal sheet'])),
            'doc_national_id'            => $b($g(['national id doc'])),
            'doc_social_insurance_print' => $b($g(['social insurance print', 'soc. insurance print'])),
            'doc_personal_photos'        => $b($g(['personal photos'])),
            'doc_union_card'             => $b($g(['union card/ skills manag certificate', 'union card'])),
            'social_insurance_number'    => $g(['social insurance number', 'social insurance no']),
            'insurance_status'           => $g(['insurance status']),
            'insurance_company'          => $g(['insurance company']),
            'form_1'                     => $b($g(['form 1'])),
            'insurance_date'             => $d($g(['insurance date'])),
            'contract_start'             => $d($g(['contract start', 'start'])),
            'contract_end'               => $d($g(['contract end', 'end'])),
            'vacation_form'              => $g(['vacation form']),
            'sanctions_form'             => $g(['sanctions form']),
            'marital_status_form'        => $g(['marital status form']),
            'no_warning_letters'         => (int) $g(['no of warning letters', 'warning letters']) ?: 0,
            'status'                     => 'on_site',
        ];
    }

    /** All 50 Excel export column headers in order */
    private function excelColumns(): array
    {
        return [
            '#', 'IBS Code', 'Punch Code', 'RotemCode', 'Project Budget',
            'English Name', 'Arabic Name', 'Position', 'Position In Arabic',
            'Department', 'Work Location', 'Saturday Group', 'Weekly Off Day', 'City', 'Address',
            'Hiring Date', 'National ID', 'Birth Date', 'Phone No', 'Another Phone',
            'Education Type', 'School/University', 'Major', 'Grad Year',
            'Category', 'Military Status', 'Mil. Days', 'Mil. Months', 'Mil. Years',
            'EC Type', 'EC Name', 'EC Name (AR)', 'EC Phone',
            'Birth Cert', 'Edu Cert', 'Military Cert', 'Criminal Sheet',
            'National ID Doc', 'Soc. Insurance Print', 'Personal Photos', 'Union Card',
            'Social Insurance No', 'Insurance Status', 'Insurance Company', 'Form 1',
            'Insurance Date', 'Contract Start', 'Contract End',
            'Vacation Form', 'Sanctions Form', 'Marital Status Form', 'Warning Letters',
        ];
    }

    private static function departmentFromPosition(string $position): string
    {
        $pos = strtolower($position);
        if (str_contains($pos, 'intervention')) return 'cm_intervention';
        if (str_contains($pos, 'hm ') || str_starts_with($pos, 'hm ') || $pos === 'hm head') return 'hm';
        if (str_contains($pos, 'cm ') || str_starts_with($pos, 'cm ') || $pos === 'cm head') return 'cm';
        if (str_contains($pos, 'pm ') || str_starts_with($pos, 'pm ')) return 'pm';
        if (str_contains($pos, 'warranty')) return 'warranty';
        return 'admin';
    }

    private function cleanPunchCode(?string $value): ?string
    {
        $code = trim((string) $value);
        if ($code === '') return null;

        $upper = strtoupper($code);
        if (in_array($upper, ['WA', 'N/A', 'NA', 'NONE', 'NO', 'NULL', '-', '--', '0'], true)) {
            return null;
        }

        return $code;
    }

    private function cleanSaturdayGroup(?string $value): ?string
    {
        $group = strtoupper(trim((string) $value));
        return in_array($group, ['A', 'B'], true) ? $group : null;
    }

    private function cleanWeeklyOffDay(?string $value): ?int
    {
        $day = strtolower(trim((string) $value));
        if ($day === '') return null;

        $days = [
            'sunday' => 0, 'sun' => 0,
            'monday' => 1, 'mon' => 1,
            'tuesday' => 2, 'tue' => 2,
            'wednesday' => 3, 'wed' => 3,
            'thursday' => 4, 'thu' => 4,
            'friday' => 5, 'fri' => 5,
            'saturday' => 6, 'sat' => 6,
        ];

        if (array_key_exists($day, $days)) return $days[$day];
        if (is_numeric($day) && (int) $day >= 0 && (int) $day <= 6) return (int) $day;

        return null;
    }

    private function weekdayLabel(int $day): string
    {
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][$day] ?? '';
    }

    private function rules(?int $excludeId = null): array
    {
        $uniqueRule = $excludeId
            ? "nullable|string|max:20|unique:employees,ibs_code,{$excludeId}"
            : 'nullable|string|max:20|unique:employees,ibs_code';

        return [
            'name'         => 'required|string|max:255',
            'ibs_code'     => $uniqueRule,
            'punch_code'   => 'nullable|string|max:20',
            'position'     => 'required|string|max:255',
            'position_id'  => 'nullable|exists:positions,id',
            'department'   => 'nullable|string|max:50',
            'work_location'=> 'nullable|string|max:100',
            'saturday_group' => 'nullable|in:A,B',
            'weekly_off_day' => 'nullable|integer|min:0|max:6',
            'hiring_date'  => 'nullable|date',
            'birth_date'   => 'nullable|date',
            'insurance_date'=> 'nullable|date',
            'contract_start'=> 'nullable|date',
            'contract_end'  => 'nullable|date',
            'resignation_date' => 'nullable|date',
            'last_working_date' => 'nullable|date',
            'category'     => 'nullable|in:Blue Collar,White Collar',
            'status'       => 'nullable|in:on_site,annual_leave,cert_expired,suspended,terminated,remote',
            'national_id'  => 'nullable|string|max:20',
            'phone'        => 'nullable|string|max:20',
            'another_phone'=> 'nullable|string|max:20',
        ];
    }
}
