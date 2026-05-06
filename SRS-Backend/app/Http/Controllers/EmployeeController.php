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
    // ── GET /api/employees ─────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $q = Employee::query();

        if ($request->filled('department') && $request->department !== 'all')
            $q->byDepartment($request->department);
        if ($request->filled('location') && $request->location !== 'all')
            $q->byLocation($request->location);
        if ($request->filled('status') && $request->status !== 'all')
            $q->byStatus($request->status);
        if ($request->filled('category') && $request->category !== 'all')
            $q->byCategory($request->category);
        if ($request->filled('search'))
            $q->search($request->search);

        $sortBy  = $request->get('sort_by', 'id');
        $sortDir = $request->get('sort_dir', 'asc');
        $perPage = (int) $request->get('per_page', 12);

        $result = $q->with('directManager:id,name,position')->orderBy($sortBy, $sortDir)->paginate($perPage);

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
        $employees = Employee::select('id','name','position','department','direct_manager_id','status','work_location')
            ->orderBy('name')
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

        $employee->update(['direct_manager_id' => $managerId ?: null]);
        $employee->load('directManager:id,name,position');

        return response()->json($employee);
    }

    // ── GET /api/employees/stats ────────────────────────────
    public function stats(): JsonResponse
    {
        return response()->json([
            'total'          => Employee::count(),
            'by_department'  => Employee::select('department', DB::raw('count(*) as count'))
                                        ->groupBy('department')->pluck('count', 'department'),
            'by_location'    => Employee::select('work_location', DB::raw('count(*) as count'))
                                        ->groupBy('work_location')->pluck('count', 'work_location'),
            'by_status'      => Employee::select('status', DB::raw('count(*) as count'))
                                        ->groupBy('status')->pluck('count', 'status'),
            'by_category'    => Employee::select('category', DB::raw('count(*) as count'))
                                        ->groupBy('category')->pluck('count', 'category'),
            'locations'      => Employee::distinct()->pluck('work_location')->filter()->sort()->values(),
            'missing_docs'   => Employee::missingDocs()->count(),
        ]);
    }

    // ── GET /api/employees/{id} ─────────────────────────────
    public function show(Employee $employee): JsonResponse
    {
        // Eager-load direct manager
        $employee->load('directManager:id,name,position');
        // Append computed accessors
        $employee->append(['department_label', 'docs_completed', 'docs_percent']);
        return response()->json($employee);
    }

    // ── POST /api/employees ─────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), $this->rules());
        if ($v->fails()) return response()->json(['errors' => $v->errors()], 422);

        return response()->json(Employee::create($request->all()), 201);
    }

    // ── PUT /api/employees/{id} ─────────────────────────────
    public function update(Request $request, Employee $employee): JsonResponse
    {
        $v = Validator::make($request->all(), $this->rules($employee->id));
        if ($v->fails()) return response()->json(['errors' => $v->errors()], 422);

        $employee->update($request->all());
        return response()->json($employee);
    }

    // ── DELETE /api/employees/{id} ──────────────────────────
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

                        Employee::updateOrCreate(
                            ['ibs_code' => $mapped['ibs_code'] ?: null],
                            $mapped
                        );
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

        return [
            'ibs_code'                   => $g(['ibs code', 'ibscode']),
            'punch_code'                 => $g(['punch code', 'punchcode']) ?: 'WA',
            'rotem_code'                 => $g(['rotemcode', 'rotem code']),
            'project_budget'             => $g(['project budget']),
            'name'                       => $g(['english name', 'name']),
            'arabic_name'                => $g(['arabic name']),
            'position'                   => $pos,
            'position_arabic'            => $g(['position in arabic']),
            'department'                 => $dept,
            'work_location'              => $g(['work location']),
            'city'                       => $g(['city']),
            'address'                    => $g(['address']),
            'hiring_date'                => $d($g(['hiring date'])),
            'national_id'                => $g(['national id number', 'national id']),
            'birth_date'                 => $d($g(['birth date'])),
            'phone'                      => $g(['phone no', 'phone']),
            'another_phone'              => $g(['another phone no', 'another phone']),
            'education_type'             => $g(['type', 'education type']),
            'education_school'           => $g(['university/school', 'university school', 'school']),
            'education_major'            => $g(['major']),
            'education_year'             => (int) $g(['year']) ?: null,
            'category'                   => $g(['category']) ?: 'Blue Collar',
            'military_status'            => $g(['military status']),
            'military_serving_days'      => (int) $g(['day']) ?: null,
            'military_serving_months'    => (int) $g(['month']) ?: null,
            'military_serving_years'     => (int) $g(['year.1']) ?: null, // second "year" col
            'emergency_contact_type'     => $g(['emergency contact type']),
            'emergency_contact_name'     => $g(['emergency contact name']),
            'emergency_contact_name_ar'  => $g(['emergency contact arabic name']),
            'emergency_contact_phone'    => $g(['emergency contact phone no']),
            'doc_birth_certificate'      => $b($g(['birth certificate'])),
            'doc_edu_certificate'        => $b($g(['edu certificate'])),
            'doc_military_certificate'   => $b($g(['military certificate'])),
            'doc_criminal_sheet'         => $b($g(['creminal sheet', 'criminal sheet'])),
            'doc_national_id'            => $b($g(['national id'])),
            'doc_social_insurance_print' => $b($g(['social insurance print'])),
            'doc_personal_photos'        => $b($g(['personal photos'])),
            'doc_union_card'             => $b($g(['union card/ skills manag certificate', 'union card'])),
            'social_insurance_number'    => $g(['social insurance number']),
            'insurance_status'           => $g(['insurance status']),
            'insurance_company'          => $g(['insurance company']),
            'form_1'                     => $b($g(['form 1'])),
            'insurance_date'             => $d($g(['insurance date'])),
            'contract_start'             => $d($g(['start'])),
            'contract_end'               => $d($g(['end'])),
            'vacation_form'              => $g(['vacation form']),
            'sanctions_form'             => $g(['sanctions form']),
            'marital_status_form'        => $g(['marital status form']),
            'no_warning_letters'         => (int) $g(['no of warning letters']) ?: 0,
            'status'                     => 'on_site',
        ];
    }

    /** All 50 Excel export column headers in order */
    private function excelColumns(): array
    {
        return [
            '#', 'IBS Code', 'Punch Code', 'RotemCode', 'Project Budget',
            'English Name', 'Arabic Name', 'Position', 'Position In Arabic',
            'Department', 'Work Location', 'City', 'Address',
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
            'department'   => 'nullable|in:workshop,heavy_maintenance,intervention,admin,engineer',
            'work_location'=> 'nullable|string|max:100',
            'hiring_date'  => 'nullable|date',
            'birth_date'   => 'nullable|date',
            'insurance_date'=> 'nullable|date',
            'contract_start'=> 'nullable|date',
            'contract_end'  => 'nullable|date',
            'category'     => 'nullable|in:Blue Collar,White Collar',
            'status'       => 'nullable|in:on_site,annual_leave,cert_expired,suspended,terminated,remote',
            'national_id'  => 'nullable|string|max:20',
            'phone'        => 'nullable|string|max:20',
            'another_phone'=> 'nullable|string|max:20',
        ];
    }
}
