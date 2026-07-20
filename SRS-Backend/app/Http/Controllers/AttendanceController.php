<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Services\AttendanceService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendanceController extends Controller
{
    protected $attendanceService;

    public function __construct(AttendanceService $attendanceService)
    {
        $this->attendanceService = $attendanceService;
    }

    /**
     * Upload and process biometric file
     *
     * POST /api/attendance/upload
     */
    public function upload(Request $request)
    {
        // .dat files come as application/octet-stream or text/plain — skip MIME check, validate by extension
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:10240',
        ]);

        // Manual extension check
        $ext = strtolower($request->file('file')?->getClientOriginalExtension() ?? '');
        if (!in_array($ext, ['dat', 'txt'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only .dat or .txt biometric files are accepted',
            ], 422);
        }

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $file = $request->file('file');
        $filePath = $file->getRealPath();

        $result = $this->attendanceService->importBiometricFile($filePath);

        if ($result['success']) {
            $data = [
                'imported'  => $result['imported'],
                'processed' => $result['processed'],
                'file_records' => $result['file_records'] ?? $result['imported'],
                'employees_count' => $result['employees_count'] ?? 0,
                'punch_codes_count' => $result['punch_codes_count'] ?? 0,
                'dates'     => $result['dates'] ?? [],
                'errors'    => $result['errors'] ?? [],
            ];

            return response()->json([
                'success' => true,
                'message' => 'Biometric file processed successfully',
                // Keep metrics at both levels so old and new frontend builds read
                // the same non-zero result during a rolling/local update.
                ...$data,
                'data' => $data,
            ], 200);
        }

        return response()->json([
            'success' => false,
            'message' => $result['message'] ?? 'Import failed',
            'errors' => $result['errors'] ?? [],
        ], 500);
    }

    /**
     * Get attendance records with filters
     *
     * GET /api/attendance
     */
    public function index(Request $request)
    {
        $filters = $request->only([
            'employee_id',
            'start_date',
            'end_date',
            'date',
            'status',
            'department',
        ]);

        $attendances = $this->attendanceService->getAttendance($filters);

        // ── Pull approved leaves overlapping the same date range ──
        $rangeStart = $filters['start_date'] ?? $filters['date'] ?? null;
        $rangeEnd   = $filters['end_date']   ?? $filters['date'] ?? null;

        $leaves = collect();
        if ($rangeStart || $rangeEnd) {
            $start = $rangeStart ?: $rangeEnd;
            $end   = $rangeEnd   ?: $rangeStart;

            $leaveQuery = LeaveRequest::query()
                ->where('type', 'lrf')
                ->where('status', 'approved')
                ->whereNotNull('employee_id')
                ->where(function ($q) use ($start, $end) {
                    // any overlap with [start, end]
                    $q->whereBetween('start_date', [$start, $end])
                      ->orWhereBetween('end_date', [$start, $end])
                      ->orWhere(function ($qq) use ($start, $end) {
                          $qq->where('start_date', '<=', $start)
                             ->where('end_date',   '>=', $end);
                      });
                });

            if (!empty($filters['employee_id'])) {
                $leaveQuery->where('employee_id', $filters['employee_id']);
            }

            $leaves = $leaveQuery->get([
                'id', 'employee_id', 'employee_name', 'leave_type',
                'start_date', 'end_date', 'days', 'paid', 'tracking_no',
                'early_from', 'early_to',
            ]);
        }

        // ── Pull approved OTRs overlapping the same date range ──
        $otrs = collect();
        if ($rangeStart || $rangeEnd) {
            $start = $rangeStart ?: $rangeEnd;
            $end   = $rangeEnd   ?: $rangeStart;

            $otrQuery = LeaveRequest::query()
                ->where('type', 'otr')
                ->where('status', 'approved')
                ->whereNotNull('employee_id')
                ->whereDate('ot_date', '>=', $start)
                ->whereDate('ot_date', '<=', $end);

            if (!empty($filters['employee_id'])) {
                $otrQuery->where('employee_id', $filters['employee_id']);
            }

            $otrs = $otrQuery->get([
                'id', 'employee_id', 'employee_name',
                'ot_date', 'start_time', 'end_time', 'hours', 'tracking_no',
            ]);
        }

        // ── Public holidays overlapping the range ──
        // A holiday range [date .. end_date ?? date] overlaps [start .. end] iff:
        //   holiday.date <= end AND (end_date ?? date) >= start
        $holidays = collect();
        if ($rangeStart || $rangeEnd) {
            $start = $rangeStart ?: $rangeEnd;
            $end   = $rangeEnd   ?: $rangeStart;
            $holidays = \App\Models\PublicHoliday::query()
                ->whereDate('date', '<=', $end)
                ->where(function ($q) use ($start) {
                    $q->whereDate('end_date', '>=', $start)
                      ->orWhere(function ($qq) use ($start) {
                          $qq->whereNull('end_date')->whereDate('date', '>=', $start);
                      });
                })
                ->get(['id', 'date', 'end_date', 'name_en', 'name_ar']);
        }

        return response()->json([
            'success'  => true,
            'data'     => $attendances,
            'leaves'   => $leaves,
            'otrs'     => $otrs,
            'holidays' => $holidays,
        ], 200);
    }

    /**
     * Create manual attendance entry
     *
     * POST /api/attendance/manual
     */
    public function manual(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'employee_id' => 'required|exists:employees,id',
            'date' => 'required|date',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,late,wfh,intervention,incomplete,shortage',
            'notes' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $attendance = $this->attendanceService->createManualEntry(
                $request->all(),
                auth()->id()
            );

            return response()->json([
                'success' => true,
                'message' => 'Manual entry created successfully',
                'data' => $attendance->load(['employee', 'creator']),
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create manual entry',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get attendance summary for an employee
     *
     * GET /api/attendance/summary/{employee_id}
     */
    public function summary(Request $request, $employeeId)
    {
        $startDate = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate = $request->input('end_date', now()->endOfMonth()->toDateString());

        $attendances = $this->attendanceService->getAttendance([
            'employee_id' => $employeeId,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);

        $summary = [
            'total_days' => $attendances->count(),
            'present_days' => $attendances->where('status', 'present')->count(),
            'absent_days' => $attendances->where('status', 'absent')->count(),
            'late_days' => $attendances->where('status', 'late')->count(),
            'wfh_days' => $attendances->where('status', 'wfh')->count(),
            'total_work_hours' => $attendances->sum('work_hours'),
            'total_overtime_hours' => $attendances->sum('overtime_hours'),
            'total_late_minutes' => $attendances->sum('late_minutes'),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => $summary,
                'attendances' => $attendances,
            ],
        ], 200);
    }

    /**
     * Export attendance to Excel — exact layout matching Monthly Attendance Transaction Record
     *
     * Structure:
     *   A:B  = left info panel (35 rows) + Attendance Summary below
     *   C    = spacer
     *   D:S  = attendance table (header row 1, data rows 2+)
     *
     * GET /api/attendance/export
     */
    public function exportExcel(Request $request): StreamedResponse
    {
        $employeeId = $request->input('employee_id');
        $startDate  = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate    = $request->input('end_date',   now()->endOfMonth()->toDateString());

        $employee    = $employeeId ? Employee::find($employeeId) : null;
        $balance     = $employee   ? LeaveBalance::where('employee_id', $employee->id)->first() : null;
        $attendances = $this->attendanceService->getAttendance([
            'employee_id' => $employeeId,
            'start_date'  => $startDate,
            'end_date'    => $endDate,
        ]);

        // ── helpers ──────────────────────────────────────────────
        $timeStr = function($t): ?string {
            if (!$t) return null;
            if ($t instanceof Carbon) return $t->format('H:i:s');
            $s = (string) $t;
            return strlen($s) > 8 ? substr($s, -8) : $s;
        };

        $toMin = function($t) use ($timeStr): ?int {
            $s = $timeStr($t);
            if (!$s) return null;
            return intval(substr($s,0,2))*60 + intval(substr($s,3,2));
        };

        $fmt12 = function(string $s): string {
            $h = intval(substr($s,0,2)); $m = intval(substr($s,3,2));
            return sprintf('%d:%02d %s', $h%12?:12, $m, $h>=12?'PM':'AM');
        };

        $decHHMM = function($h): string {
            if (!$h || (float)$h <= 0) return '0:00';
            $tot = (int) round((float)$h * 60);
            return sprintf('%d:%02d', intdiv($tot,60), $tot%60);
        };

        // ── build date rows ──────────────────────────────────────
        $dateRows = [];
        $cur = Carbon::parse($startDate);
        $end = Carbon::parse($endDate);
        $sn  = 1;
        $nightStartMin    = 19 * 60; // 7 PM
        $isEmpIntervention = $employee ? $employee->isIntervention() : false;

        while ($cur->lte($end)) {
            $ds  = $cur->toDateString();
            $rec = $attendances->first(fn($a) => $a->date?->format('Y-m-d') === $ds);
            $off = $employee ? !$employee->isWorkingDay($cur->copy()) : in_array($cur->dayOfWeek,[5,6]);
            $dateRows[] = ['sn' => $sn++, 'date' => $cur->copy(), 'isDayOff' => $off, 'record' => $rec];
            $cur->addDay();
        }

        // ── totals ───────────────────────────────────────────────
        // OT is rounded the same way as the OT-rate columns: floor(mins/60) per row
        $absentCount  = $attendances->where('status','absent')->count();
        $totalDedMin  = $absentCount * 540;
        $totalDedHrs  = $totalDedMin / 60;
        $totalDayOT   = 0;   // integer — sum of per-row floor(dayMins/60)
        $totalNightOT = 0;   // integer — sum of per-row max(1,floor(nightMins/60))

        foreach ($dateRows as $dr) {
            $r = $dr['record'];
            if (!$r || !$r->overtime_hours || (float)$r->overtime_hours <= 0) continue;
            $outM = $toMin($r->check_out);
            if ($outM === null) continue;
            if ($isEmpIntervention) {
                $inM = $toMin($r->check_in);
                if ($inM === null) continue;
                $otSt = $inM + ($r->expected_hours ?? 9) * 60;
            } else {
                $otSt = 17 * 60; // 5 PM fixed for regular employees
            }
            if ($outM <= $otSt) continue;
            $dayMins   = max(0, min($outM, $nightStartMin) - $otSt);
            $nightMins = max(0, $outM - max($otSt, $nightStartMin));
            // >= 30 min → full hour; < 30 min → 0
            $totalDayOT   += (int) round($dayMins / 60);
            $totalNightOT += (int) round($nightMins / 60);
        }

        // Total OT = day + night (floored integer hours, same as the table columns)
        $totalOTHrs = $totalDayOT + $totalNightOT;

        // ── balance ──────────────────────────────────────────────
        $annual        = $balance?->annual  ?? 21;
        $casual        = $balance?->casual  ?? 6;
        $annualRemain  = $balance?->annual_remaining ?? $annual;
        $casualRemain  = $balance?->casual_remaining ?? $casual;
        $consumedAnnual = $annual - $annualRemain;
        $consumedCasual = $casual - $casualRemain;

        // ── colours & borders ────────────────────────────────────
        $C_HDR     = '1E3A2F';  // dark green — table header
        $C_SECTION = '4B5563';  // dark gray  — section headers in left panel
        $C_LABEL   = 'D1D5DB';  // light gray — label cells
        $C_YELLOW  = 'FEF9C3';  // yellow     — Employee ID row
        $C_BLUE    = 'BFDBFE';  // blue       — Location row
        $C_DAYOFF  = 'D5D5D5';  // gray       — weekend / day-off rows
        $C_OT      = 'FFF9C4';  // yellow     — overtime rows
        $C_WHITE   = 'FFFFFF';
        $C_ALT     = 'F3F4F6';  // alternating row

        $thin  = ['borderStyle' => Border::BORDER_THIN,   'color' => ['rgb' => '9CA3AF']];
        $black = ['borderStyle' => Border::BORDER_THIN,   'color' => ['rgb' => '000000']];
        $med   = ['borderStyle' => Border::BORDER_MEDIUM, 'color' => ['rgb' => '000000']];

        // ── spreadsheet ──────────────────────────────────────────
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Attendance');

        // Page setup: landscape A4, fit to 1 page wide
        $sheet->getPageSetup()
              ->setOrientation(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::ORIENTATION_LANDSCAPE)
              ->setPaperSize(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::PAPERSIZE_A4)
              ->setFitToWidth(1)
              ->setFitToHeight(0)
              ->setFitToPage(true);
        $sheet->getPageMargins()->setTop(0.4)->setBottom(0.4)->setLeft(0.3)->setRight(0.3);
        $sheet->getHeaderFooter()
              ->setOddHeader('&C&B&14 Monthly Attendance Transaction Record')
              ->setOddFooter('&L&"Arial,Bold"SRS-HR-ATT-01  Rev.01&R&BPage &P of &N');

        // ── helper closures for styling ───────────────────────────
        $styleLabel = function(string $range) use ($sheet, $C_LABEL, $thin) {
            $sheet->getStyle($range)->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_LABEL]],
                'font'      => ['name' => 'Arial', 'size' => 8],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER,
                                'horizontal' => Alignment::HORIZONTAL_LEFT],
                'borders'   => ['allBorders' => $thin],
            ]);
        };
        $styleValue = function(string $range, bool $bold = false) use ($sheet, $thin) {
            $sheet->getStyle($range)->applyFromArray([
                'font'      => ['name' => 'Arial', 'size' => 8, 'bold' => $bold],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER,
                                'horizontal' => Alignment::HORIZONTAL_LEFT],
                'borders'   => ['allBorders' => $thin],
            ]);
        };
        $styleSection = function(string $cellA, string $cellB) use ($sheet, $C_SECTION, $black) {
            $sheet->mergeCells("{$cellA}:{$cellB}");
            $sheet->getStyle("{$cellA}:{$cellB}")->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_SECTION]],
                'font'      => ['name' => 'Arial', 'bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 9],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER,
                                'vertical'   => Alignment::VERTICAL_CENTER],
                'borders'   => ['allBorders' => $black],
            ]);
        };

        // ══════════════════════════════════════════════════════════
        //  LEFT PANEL — columns A (label) and B (value)
        //  Row 1  = IBS No        ← aligns with table header row
        //  Row 2+ = rest of info  ← aligns with data rows
        // ══════════════════════════════════════════════════════════

        // style: 'normal' | 'section' | 'yellow' | 'blue'
        $leftDefs = [
            /* 1  */ ['IBS No',                    $employee?->ibs_code ?? '',                         'normal'],
            /* 2  */ ['Project Name',              'Line 1',                                            'normal'],
            /* 3  */ ['Employee Name',             $employee?->name ?? '',                              'normal'],
            /* 4  */ ['Employee ID',               $employee?->employee_id ?? $employee?->ibs_code ?? '', 'yellow'],
            /* 5  */ ['Hiring Date',               $employee?->hiring_date?->format('j-M-Y') ?? '',    'normal'],
            /* 6  */ ['Probation Period End Date', $employee?->probation_end_date?->format('j-M-Y') ?? '', 'normal'],
            /* 7  */ ['Title',                     $employee?->position ?? '',                          'normal'],
            /* 8  */ ['Location',                  $employee?->work_location ?? '',                     'blue'],
            /* 9  */ ['Department',                $employee?->department ?? '',                        'normal'],
            /* 10 */ ['No Of Warning Letter',      $employee?->no_warning_letters ?? '',               'normal'],
            /* 11 */ ['Employer',                  '',                                                  'section'],
            /* 12 */ ['Balance Effective Date',    Carbon::parse($startDate)->format('j-M-Y'),          'normal'],
            /* 13 */ ['Available Balance',         $annual,                                             'normal'],
            /* 14 */ ['Annual Balance',            $annualRemain,                                       'normal'],
            /* 15 */ ['Casual Balance',            $casualRemain,                                       'normal'],
            /* 16 */ ['Consumed Annual Balance',   $consumedAnnual,                                     'normal'],
            /* 17 */ ['Consumed Casual Balance',   $consumedCasual,                                     'normal'],
            /* 18 */ ['Remain Annual Balance',     $annualRemain,                                       'normal'],
            /* 19 */ ['Remain Casual Balance',     $casualRemain,                                       'normal'],
            /* 20 */ ['Early Leave',               '',                                                  'normal'],
            /* 21 */ ['Zero Balanced Vacations',   '',                                                  'normal'],
            /* 22 */ ['Deduction in Minutes',      number_format($totalDedMin, 2),                      'normal'],
            /* 23 */ ['Deduction in Hours',        number_format($totalDedHrs, 2),                      'normal'],
            /* 24 */ ['Over Time in Hours',        number_format($totalOTHrs, 2),                       'normal'],
            /* 25 */ ['',                          '',                                                  'normal'],
            /* 26 */ ['Start',                     '8:00:00 AM',                                        'normal'],
            /* 27 */ ['End',                       '5:00:00 PM',                                        'normal'],
            /* 28 */ ['',                          '',                                                  'normal'],
            /* 29 */ ['',                          '',                                                  'normal'],
            /* 30 */ ['Attendace Transaction Role', '',                                                 'section'],
            /* 31 */ ['Salary',                    '',                                                  'normal'],
            /* 32 */ ['Day Rate',                  0,                                                   'normal'],
            /* 33 */ ['Day Over Time Rate',        0,                                                   'normal'],
            /* 34 */ ['Night Over Time Rate',      0,                                                   'normal'],
            /* 35 */ ['Hour Rate',                 0,                                                   'normal'],
        ];

        foreach ($leftDefs as $ri => $def) {
            $row   = $ri + 1;
            $style = $def[2];
            $sheet->getRowDimension($row)->setRowHeight(16);

            if ($style === 'section') {
                $sheet->setCellValue("A{$row}", $def[0]);
                $styleSection("A{$row}", "B{$row}");
            } else {
                $sheet->setCellValue("A{$row}", $def[0]);
                $sheet->setCellValue("B{$row}", $def[1]);
                $styleLabel("A{$row}");
                $styleValue("B{$row}", true);

                if ($style === 'yellow') {
                    $sheet->getStyle("A{$row}:B{$row}")->getFill()
                          ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($C_YELLOW);
                } elseif ($style === 'blue') {
                    $sheet->getStyle("A{$row}:B{$row}")->getFill()
                          ->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($C_BLUE);
                }
            }
        }

        // ── Attendance Summary — below the 35 left-panel rows ────
        $sumHeaderRow = count($leftDefs) + 2;  // row 37

        $sheet->setCellValue("A{$sumHeaderRow}", 'Attendance Summary');
        $styleSection("A{$sumHeaderRow}", "B{$sumHeaderRow}");
        $sheet->getRowDimension($sumHeaderRow)->setRowHeight(16);

        $summaryDefs = [
            ['Total Deduction in Minutes', number_format($totalDedMin, 1)],
            ['Total Deduction in Hours',   number_format($totalDedHrs, 1)],
            ['Total Day Over Time',        number_format($totalDayOT,  1)],
            ['Total Night Over Time',      number_format($totalNightOT,1)],
            ['Total Double Pay Over Time', '0.0'],
            ['Total Over Time',            number_format($totalOTHrs,  1)],
        ];
        foreach ($summaryDefs as $si => $sd) {
            $row = $sumHeaderRow + 1 + $si;
            $sheet->setCellValue("A{$row}", $sd[0]);
            $sheet->setCellValue("B{$row}", $sd[1]);
            $styleLabel("A{$row}");
            $styleValue("B{$row}", true);
            $sheet->getStyle("B{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getRowDimension($row)->setRowHeight(15);
        }

        // ══════════════════════════════════════════════════════════
        //  RIGHT — attendance table, columns D:S
        //  Row 1 = header  (aligns with IBS No on the left)
        //  Row 2 = first data row  (aligns with Project Name on left)
        // ══════════════════════════════════════════════════════════
        $TC          = 4;  // column D = index 4
        $HDR_ROW     = 1;  // header in row 1
        $DATA_START  = 2;  // data starts row 2

        $tableHeaders = [
            'Sn', 'Date (Day)', 'Day', 'Check IN', 'Check Out',
            'Total working Hrs', 'Hour Rate',
            'Over Time Start', 'Over Time End',
            'Day OverTime Rate', 'Night Over Time Rate', 'Double Pay',
            'Total Over Time',
            'DEDUCTIONS (HOURS)', 'DEDUCTIONS (MIN)',
            'Notes',
        ];
        $firstCol = Coordinate::stringFromColumnIndex($TC);
        $lastCol  = Coordinate::stringFromColumnIndex($TC + count($tableHeaders) - 1);

        // Header row
        foreach ($tableHeaders as $ci => $hdr) {
            $col = Coordinate::stringFromColumnIndex($TC + $ci);
            $sheet->setCellValue("{$col}{$HDR_ROW}", $hdr);
        }
        $sheet->getStyle("{$firstCol}{$HDR_ROW}:{$lastCol}{$HDR_ROW}")->applyFromArray([
            'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_HDR]],
            'font'      => ['name' => 'Arial', 'bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 8],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER,
                            'vertical'   => Alignment::VERTICAL_CENTER,
                            'wrapText'   => true],
            'borders'   => ['allBorders' => $black],
        ]);
        $sheet->getRowDimension($HDR_ROW)->setRowHeight(28);

        // Data rows
        foreach ($dateRows as $ri => $dr) {
            $row = $DATA_START + $ri;
            $rec = $dr['record'];
            $off = $dr['isDayOff'];
            $dt  = $dr['date'];

            // OT
            $otStartStr = $otEndStr = '';
            $dayRate = $nightRate = 0;
            $totalOTVal = '0.0';

            if ($rec && $rec->overtime_hours && (float)$rec->overtime_hours > 0 && $rec->check_out) {
                $outM = $toMin($rec->check_out);
                if ($outM !== null) {
                    if ($isEmpIntervention) {
                        $inM  = $toMin($rec->check_in);
                        $otStM = $inM !== null ? $inM + ($rec->expected_hours ?? 9) * 60 : null;
                    } else {
                        $otStM = 17 * 60; // 5 PM fixed for regular employees
                    }
                    if ($otStM !== null && $outM > $otStM) {
                        $otStartStr = $fmt12(sprintf('%02d:%02d:00', intdiv($otStM,60), $otStM%60));
                        $otEndStr   = $fmt12(sprintf('%02d:%02d:00', intdiv($outM,60), $outM%60));
                        $dayMins    = max(0, min($outM,$nightStartMin) - $otStM);
                        $nightMins  = max(0, $outM - max($otStM,$nightStartMin));
                        // >= 30 min → full hour; < 30 min → 0
                        $dayRate    = (int) round($dayMins / 60);
                        $nightRate  = (int) round($nightMins / 60);
                        $totalOTVal = $dayRate + $nightRate;
                    }
                }
            }

            // Deductions
            $dedHrs = $dedMin = '';
            if ($rec && $rec->status === 'absent') {
                $dedHrs = 9;
                $dedMin = 540;
            }

            // Work hours string
            $workHrsStr = '';
            if ($rec) {
                $workHrsStr = $rec->status === 'absent' ? '0:00' : $decHHMM($rec->work_hours);
            } elseif ($off) {
                $workHrsStr = '0:00';
            }

            $ciStr = $timeStr($rec?->check_in);
            $coStr = $timeStr($rec?->check_out);

            $values = [
                $dr['sn'],
                $dt->format('j-M-Y'),
                $dt->format('D'),
                $ciStr ? $fmt12($ciStr) : '',
                $coStr ? $fmt12($coStr) : '',
                $workHrsStr,
                '0.00',
                $otStartStr,
                $otEndStr,
                $dayRate,
                $nightRate,
                0,
                $totalOTVal,
                $dedHrs !== '' ? $dedHrs : '',
                $dedMin !== '' ? $dedMin : '',
                $rec?->notes ?? '',
            ];

            foreach ($values as $ci => $val) {
                $col = Coordinate::stringFromColumnIndex($TC + $ci);
                $sheet->setCellValue("{$col}{$row}", $val);
            }

            $bg = $off
                ? $C_DAYOFF
                : ($rec && (float)($rec->overtime_hours??0) > 0 ? $C_OT : ($ri%2===0 ? $C_WHITE : $C_ALT));

            $txtRgb = $off ? 'AAAAAA' : '000000';

            $sheet->getStyle("{$firstCol}{$row}:{$lastCol}{$row}")->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $bg]],
                'font'      => ['name' => 'Arial', 'size' => 8, 'color' => ['rgb' => $txtRgb]],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER,
                                'vertical'   => Alignment::VERTICAL_CENTER],
                'borders'   => ['allBorders' => $thin],
            ]);
            $sheet->getRowDimension($row)->setRowHeight(14);
        }

        // ── column widths ────────────────────────────────────────
        $sheet->getColumnDimension('A')->setWidth(25);
        $sheet->getColumnDimension('B')->setWidth(18);
        $sheet->getColumnDimension('C')->setWidth(1.2);

        // D=Sn E=Date F=Day G=CheckIn H=CheckOut I=WorkHrs J=HourRate
        // K=OTStart L=OTEnd M=DayOTRate N=NightOTRate O=DoublePay
        // P=TotalOT Q=DedHrs R=DedMin S=Notes
        $colWidths = [4, 11, 5, 9, 9, 9, 7, 10, 10, 8, 10, 7, 9, 10, 9, 10];
        foreach ($colWidths as $ci => $w) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($TC + $ci))->setWidth($w);
        }

        // Freeze: keep row 1 (header) and columns A:C visible when scrolling
        $sheet->freezePane('D2');
        $sheet->setSelectedCell('D2');

        // Print area — must cover left panel (35 rows), right data rows, AND summary table
        $lastDataRow = $DATA_START + count($dateRows) - 1;
        $sumLastRow  = $sumHeaderRow + count($summaryDefs);   // row 43 for 6 summary items
        $printLastRow = max($lastDataRow, $sumLastRow);
        $sheet->getPageSetup()->setPrintArea("A1:{$lastCol}{$printLastRow}");

        // ── write file ───────────────────────────────────────────
        $writer   = new Xlsx($spreadsheet);
        $empSlug  = $employee ? preg_replace('/[^a-zA-Z0-9_-]/','_',$employee->name) : 'All';
        $filename = "Attendance_{$empSlug}_{$startDate}_{$endDate}.xlsx";

        return response()->streamDownload(
            fn() => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    /**
     * Export ALL employees — one sheet per employee.
     *
     * GET /api/attendance/export-all
     */
    public function exportAllExcel(Request $request): StreamedResponse
    {
        $startDate = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate   = $request->input('end_date',   now()->endOfMonth()->toDateString());

        $employees   = Employee::active()->orderBy('name')->get();
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0); // remove default blank sheet

        foreach ($employees as $idx => $employee) {
            $sheet = new \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet(
                $spreadsheet,
                mb_substr(preg_replace('/[\/\\\?\*\[\]:]+/', '_', $employee->name), 0, 31)
            );
            $spreadsheet->addSheet($sheet, $idx);
            $this->buildEmployeeSheet($sheet, $employee, $startDate, $endDate);
        }

        if ($spreadsheet->getSheetCount() === 0) {
            $spreadsheet->createSheet()->setTitle('No Employees');
        }

        $spreadsheet->setActiveSheetIndex(0);

        $writer   = new Xlsx($spreadsheet);
        $filename = "Attendance_All_{$startDate}_{$endDate}.xlsx";

        return response()->streamDownload(
            fn() => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    /**
     * Build a single employee's attendance sheet (reused by both export methods).
     */
    private function buildEmployeeSheet(
        \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet,
        Employee $employee,
        string $startDate,
        string $endDate
    ): void {
        $balance     = LeaveBalance::where('employee_id', $employee->id)->first();
        $attendances = $this->attendanceService->getAttendance([
            'employee_id' => $employee->id,
            'start_date'  => $startDate,
            'end_date'    => $endDate,
        ]);

        // ── helpers ──────────────────────────────────────────────
        $timeStr = function($t): ?string {
            if (!$t) return null;
            if ($t instanceof Carbon) return $t->format('H:i:s');
            $s = (string) $t;
            return strlen($s) > 8 ? substr($s, -8) : $s;
        };
        $toMin = function($t) use ($timeStr): ?int {
            $s = $timeStr($t);
            if (!$s) return null;
            return intval(substr($s,0,2))*60 + intval(substr($s,3,2));
        };
        $fmt12 = function(string $s): string {
            $h = intval(substr($s,0,2)); $m = intval(substr($s,3,2));
            return sprintf('%d:%02d %s', $h%12?:12, $m, $h>=12?'PM':'AM');
        };
        $decHHMM = function($h): string {
            if (!$h || (float)$h <= 0) return '0:00';
            $tot = (int) round((float)$h * 60);
            return sprintf('%d:%02d', intdiv($tot,60), $tot%60);
        };

        // ── build date rows ──────────────────────────────────────
        $dateRows = [];
        $cur = Carbon::parse($startDate);
        $end = Carbon::parse($endDate);
        $sn  = 1;
        $isEmpIntervention = $employee->isIntervention();
        $nightStartMin     = 19 * 60; // 7 PM

        while ($cur->lte($end)) {
            $ds  = $cur->toDateString();
            $rec = $attendances->first(fn($a) => $a->date?->format('Y-m-d') === $ds);
            $off = !$employee->isWorkingDay($cur->copy());
            $dateRows[] = ['sn' => $sn++, 'date' => $cur->copy(), 'isDayOff' => $off, 'record' => $rec];
            $cur->addDay();
        }

        // ── totals ───────────────────────────────────────────────
        $absentCount  = $attendances->where('status','absent')->count();
        $totalDedMin  = $absentCount * 540;
        $totalDedHrs  = $totalDedMin / 60;
        $totalDayOT   = 0;
        $totalNightOT = 0;

        foreach ($dateRows as $dr) {
            $r = $dr['record'];
            if (!$r || !$r->overtime_hours || (float)$r->overtime_hours <= 0) continue;
            $outM = $toMin($r->check_out);
            if ($outM === null) continue;
            if ($isEmpIntervention) {
                $inM = $toMin($r->check_in);
                if ($inM === null) continue;
                $otSt = $inM + ($r->expected_hours ?? 9) * 60;
            } else {
                $otSt = 17 * 60; // 5 PM fixed for regular employees
            }
            if ($outM <= $otSt) continue;
            $dayMins   = max(0, min($outM, $nightStartMin) - $otSt);
            $nightMins = max(0, $outM - max($otSt, $nightStartMin));
            $totalDayOT   += (int) round($dayMins / 60);
            $totalNightOT += (int) round($nightMins / 60);
        }
        $totalOTHrs = $totalDayOT + $totalNightOT;

        // ── balance ──────────────────────────────────────────────
        $annual         = $balance?->annual  ?? 21;
        $casual         = $balance?->casual  ?? 6;
        $annualRemain   = $balance?->annual_remaining ?? $annual;
        $casualRemain   = $balance?->casual_remaining ?? $casual;
        $consumedAnnual = $annual - $annualRemain;
        $consumedCasual = $casual - $casualRemain;

        // ── colours & borders ─────────────────────────────────────
        $C_HDR     = '1E3A2F';
        $C_SECTION = '4B5563';
        $C_LABEL   = 'D1D5DB';
        $C_YELLOW  = 'FEF9C3';
        $C_BLUE    = 'BFDBFE';
        $C_DAYOFF  = 'D5D5D5';
        $C_OT      = 'FFF9C4';
        $C_WHITE   = 'FFFFFF';
        $C_ALT     = 'F3F4F6';

        $thin  = ['borderStyle' => Border::BORDER_THIN,   'color' => ['rgb' => '9CA3AF']];
        $black = ['borderStyle' => Border::BORDER_THIN,   'color' => ['rgb' => '000000']];

        // ── styling helpers ───────────────────────────────────────
        $styleLabel = function(string $range) use ($sheet, $C_LABEL, $thin) {
            $sheet->getStyle($range)->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_LABEL]],
                'font'      => ['name' => 'Arial', 'size' => 8],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER, 'horizontal' => Alignment::HORIZONTAL_LEFT],
                'borders'   => ['allBorders' => $thin],
            ]);
        };
        $styleValue = function(string $range, bool $bold = false) use ($sheet, $thin) {
            $sheet->getStyle($range)->applyFromArray([
                'font'      => ['name' => 'Arial', 'size' => 8, 'bold' => $bold],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER, 'horizontal' => Alignment::HORIZONTAL_LEFT],
                'borders'   => ['allBorders' => $thin],
            ]);
        };
        $styleSection = function(string $cellA, string $cellB) use ($sheet, $C_SECTION, $black) {
            $sheet->mergeCells("{$cellA}:{$cellB}");
            $sheet->getStyle("{$cellA}:{$cellB}")->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_SECTION]],
                'font'      => ['name' => 'Arial', 'bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 9],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
                'borders'   => ['allBorders' => $black],
            ]);
        };

        // ── left panel ────────────────────────────────────────────
        $leftDefs = [
            ['IBS No',                    $employee->ibs_code ?? '',                              'normal'],
            ['Project Name',              'Line 1',                                               'normal'],
            ['Employee Name',             $employee->name ?? '',                                  'normal'],
            ['Employee ID',               $employee->ibs_code ?? '',                              'yellow'],
            ['Hiring Date',               $employee->hiring_date?->format('j-M-Y') ?? '',         'normal'],
            ['Probation Period End Date', '',                                                      'normal'],
            ['Title',                     $employee->position ?? '',                               'normal'],
            ['Location',                  $employee->work_location ?? '',                          'blue'],
            ['Department',                $employee->department ?? '',                             'normal'],
            ['No Of Warning Letter',      $employee->no_warning_letters ?? '',                    'normal'],
            ['Employer',                  '',                                                      'section'],
            ['Balance Effective Date',    Carbon::parse($startDate)->format('j-M-Y'),              'normal'],
            ['Available Balance',         $annual,                                                 'normal'],
            ['Annual Balance',            $annualRemain,                                           'normal'],
            ['Casual Balance',            $casualRemain,                                           'normal'],
            ['Consumed Annual Balance',   $consumedAnnual,                                         'normal'],
            ['Consumed Casual Balance',   $consumedCasual,                                         'normal'],
            ['Remain Annual Balance',     $annualRemain,                                           'normal'],
            ['Remain Casual Balance',     $casualRemain,                                           'normal'],
            ['Early Leave',               '',                                                      'normal'],
            ['Zero Balanced Vacations',   '',                                                      'normal'],
            ['Deduction in Minutes',      number_format($totalDedMin, 2),                          'normal'],
            ['Deduction in Hours',        number_format($totalDedHrs, 2),                          'normal'],
            ['Over Time in Hours',        number_format($totalOTHrs, 2),                           'normal'],
            ['',                          '',                                                      'normal'],
            ['Start',                     '8:00:00 AM',                                            'normal'],
            ['End',                       '5:00:00 PM',                                            'normal'],
            ['',                          '',                                                      'normal'],
            ['',                          '',                                                      'normal'],
            ['Attendace Transaction Role','',                                                      'section'],
            ['Salary',                    '',                                                      'normal'],
            ['Day Rate',                  0,                                                       'normal'],
            ['Day Over Time Rate',        0,                                                       'normal'],
            ['Night Over Time Rate',      0,                                                       'normal'],
            ['Hour Rate',                 0,                                                       'normal'],
        ];

        foreach ($leftDefs as $ri => $def) {
            $row   = $ri + 1;
            $style = $def[2];
            $sheet->getRowDimension($row)->setRowHeight(16);
            if ($style === 'section') {
                $sheet->setCellValue("A{$row}", $def[0]);
                $styleSection("A{$row}", "B{$row}");
            } else {
                $sheet->setCellValue("A{$row}", $def[0]);
                $sheet->setCellValue("B{$row}", $def[1]);
                $styleLabel("A{$row}");
                $styleValue("B{$row}", true);
                if ($style === 'yellow') {
                    $sheet->getStyle("A{$row}:B{$row}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($C_YELLOW);
                } elseif ($style === 'blue') {
                    $sheet->getStyle("A{$row}:B{$row}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($C_BLUE);
                }
            }
        }

        // ── attendance summary ────────────────────────────────────
        $sumHeaderRow = count($leftDefs) + 2;
        $sheet->setCellValue("A{$sumHeaderRow}", 'Attendance Summary');
        $styleSection("A{$sumHeaderRow}", "B{$sumHeaderRow}");
        $sheet->getRowDimension($sumHeaderRow)->setRowHeight(16);

        $summaryDefs = [
            ['Total Deduction in Minutes', number_format($totalDedMin, 1)],
            ['Total Deduction in Hours',   number_format($totalDedHrs, 1)],
            ['Total Day Over Time',        number_format($totalDayOT,  1)],
            ['Total Night Over Time',      number_format($totalNightOT,1)],
            ['Total Double Pay Over Time', '0.0'],
            ['Total Over Time',            number_format($totalOTHrs,  1)],
        ];
        foreach ($summaryDefs as $si => $sd) {
            $row = $sumHeaderRow + 1 + $si;
            $sheet->setCellValue("A{$row}", $sd[0]);
            $sheet->setCellValue("B{$row}", $sd[1]);
            $styleLabel("A{$row}");
            $styleValue("B{$row}", true);
            $sheet->getStyle("B{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getRowDimension($row)->setRowHeight(15);
        }

        // ── attendance table ──────────────────────────────────────
        $TC         = 4;
        $HDR_ROW    = 1;
        $DATA_START = 2;

        $tableHeaders = [
            'Sn', 'Date (Day)', 'Day', 'Check IN', 'Check Out',
            'Total working Hrs', 'Hour Rate',
            'Over Time Start', 'Over Time End',
            'Day OverTime Rate', 'Night Over Time Rate', 'Double Pay',
            'Total Over Time',
            'DEDUCTIONS (HOURS)', 'DEDUCTIONS (MIN)',
            'Notes',
        ];
        $firstCol = Coordinate::stringFromColumnIndex($TC);
        $lastCol  = Coordinate::stringFromColumnIndex($TC + count($tableHeaders) - 1);

        foreach ($tableHeaders as $ci => $hdr) {
            $col = Coordinate::stringFromColumnIndex($TC + $ci);
            $sheet->setCellValue("{$col}{$HDR_ROW}", $hdr);
        }
        $sheet->getStyle("{$firstCol}{$HDR_ROW}:{$lastCol}{$HDR_ROW}")->applyFromArray([
            'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_HDR]],
            'font'      => ['name' => 'Arial', 'bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 8],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER, 'wrapText' => true],
            'borders'   => ['allBorders' => $black],
        ]);
        $sheet->getRowDimension($HDR_ROW)->setRowHeight(28);

        foreach ($dateRows as $ri => $dr) {
            $row = $DATA_START + $ri;
            $rec = $dr['record'];
            $off = $dr['isDayOff'];
            $dt  = $dr['date'];

            $otStartStr = $otEndStr = '';
            $dayRate = $nightRate = 0;
            $totalOTVal = '0.0';

            if ($rec && $rec->overtime_hours && (float)$rec->overtime_hours > 0 && $rec->check_out) {
                $outM = $toMin($rec->check_out);
                if ($outM !== null) {
                    if ($isEmpIntervention) {
                        $inM  = $toMin($rec->check_in);
                        $otStM = $inM !== null ? $inM + ($rec->expected_hours ?? 9) * 60 : null;
                    } else {
                        $otStM = 17 * 60; // 5 PM fixed for regular employees
                    }
                    if ($otStM !== null && $outM > $otStM) {
                        $otStartStr = $fmt12(sprintf('%02d:%02d:00', intdiv($otStM,60), $otStM%60));
                        $otEndStr   = $fmt12(sprintf('%02d:%02d:00', intdiv($outM,60), $outM%60));
                        $dayMins    = max(0, min($outM,$nightStartMin) - $otStM);
                        $nightMins  = max(0, $outM - max($otStM,$nightStartMin));
                        $dayRate    = (int) round($dayMins / 60);
                        $nightRate  = (int) round($nightMins / 60);
                        $totalOTVal = $dayRate + $nightRate;
                    }
                }
            }

            $dedHrs = $dedMin = '';
            if ($rec && $rec->status === 'absent') { $dedHrs = 9; $dedMin = 540; }

            $workHrsStr = '';
            if ($rec) {
                $workHrsStr = $rec->status === 'absent' ? '0:00' : $decHHMM($rec->work_hours);
            } elseif ($off) {
                $workHrsStr = '0:00';
            }

            $ciStr = $timeStr($rec?->check_in);
            $coStr = $timeStr($rec?->check_out);

            $values = [
                $dr['sn'],
                $dt->format('j-M-Y'),
                $dt->format('D'),
                $ciStr ? $fmt12($ciStr) : '',
                $coStr ? $fmt12($coStr) : '',
                $workHrsStr,
                '0.00',
                $otStartStr,
                $otEndStr,
                $dayRate,
                $nightRate,
                0,
                $totalOTVal,
                $dedHrs !== '' ? $dedHrs : '',
                $dedMin !== '' ? $dedMin : '',
                $rec?->notes ?? '',
            ];

            foreach ($values as $ci => $val) {
                $col = Coordinate::stringFromColumnIndex($TC + $ci);
                $sheet->setCellValue("{$col}{$row}", $val);
            }

            $bg = $off ? $C_DAYOFF : ($rec && (float)($rec->overtime_hours??0) > 0 ? $C_OT : ($ri%2===0 ? $C_WHITE : $C_ALT));

            $sheet->getStyle("{$firstCol}{$row}:{$lastCol}{$row}")->applyFromArray([
                'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $bg]],
                'font'      => ['name' => 'Arial', 'size' => 8, 'color' => ['rgb' => $off ? 'AAAAAA' : '000000']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
                'borders'   => ['allBorders' => $thin],
            ]);
            $sheet->getRowDimension($row)->setRowHeight(14);
        }

        // ── column widths ─────────────────────────────────────────
        $sheet->getColumnDimension('A')->setWidth(25);
        $sheet->getColumnDimension('B')->setWidth(18);
        $sheet->getColumnDimension('C')->setWidth(1.2);
        foreach ([4,11,5,9,9,9,7,10,10,8,10,7,9,10,9,10] as $ci => $w) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($TC + $ci))->setWidth($w);
        }

        $sheet->getPageSetup()
              ->setOrientation(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::ORIENTATION_LANDSCAPE)
              ->setPaperSize(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::PAPERSIZE_A4)
              ->setFitToWidth(1)->setFitToHeight(0)->setFitToPage(true);
        $sheet->getPageMargins()->setTop(0.4)->setBottom(0.4)->setLeft(0.3)->setRight(0.3);
        $sheet->getHeaderFooter()
              ->setOddHeader('&C&B&14 Monthly Attendance Transaction Record')
              ->setOddFooter('&L&"Arial,Bold"SRS-HR-ATT-01  Rev.01&R&BPage &P of &N');
        $sheet->freezePane('D2');

        $lastDataRow  = $DATA_START + count($dateRows) - 1;
        $sumLastRow   = $sumHeaderRow + count($summaryDefs);
        $printLastRow = max($lastDataRow, $sumLastRow);
        $sheet->getPageSetup()->setPrintArea("A1:{$lastCol}{$printLastRow}");
    }

    /**
     * Internal Salary Sheet — aggregated OT & deductions for all employees
     *
     * GET /api/attendance/internal-salary
     */
    public function internalSalary(Request $request)
    {
        $startDate = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate   = $request->input('end_date',   now()->endOfMonth()->toDateString());

        $employees = Employee::active()->where('status', 'on_site')
            ->orderBy('department')->orderBy('name')
            ->get();

        $approvedOTRs = LeaveRequest::where('type', 'otr')
            ->where('status', 'approved')
            ->whereDate('ot_date', '>=', $startDate)
            ->whereDate('ot_date', '<=', $endDate)
            ->get();

        $rows = [];

        foreach ($employees as $employee) {
            $attendances = $this->attendanceService->getAttendance([
                'employee_id' => $employee->id,
                'start_date'  => $startDate,
                'end_date'    => $endDate,
            ]);

            $row = $this->calcSalaryRow($employee, $attendances, $startDate, $endDate, $approvedOTRs);
            $rows[] = $row;
        }

        return response()->json([
            'success' => true,
            'data'    => $rows,
            'period'  => ['start' => $startDate, 'end' => $endDate],
        ]);
    }

    /**
     * Export Internal Salary Sheet as Excel
     *
     * GET /api/attendance/internal-salary/export
     */
    public function internalSalaryExport(Request $request): StreamedResponse
    {
        $startDate = $request->input('start_date', now()->startOfMonth()->toDateString());
        $endDate   = $request->input('end_date',   now()->endOfMonth()->toDateString());

        $employees = Employee::active()->where('status', 'on_site')
            ->orderBy('department')->orderBy('name')
            ->get();

        $approvedOTRs = LeaveRequest::where('type', 'otr')
            ->where('status', 'approved')
            ->whereDate('ot_date', '>=', $startDate)
            ->whereDate('ot_date', '<=', $endDate)
            ->get();

        $rows = [];
        foreach ($employees as $employee) {
            $attendances = $this->attendanceService->getAttendance([
                'employee_id' => $employee->id,
                'start_date'  => $startDate,
                'end_date'    => $endDate,
            ]);
            $rows[] = $this->calcSalaryRow($employee, $attendances, $startDate, $endDate, $approvedOTRs);
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Internal Salary sheet');

        $sheet->getPageSetup()
              ->setOrientation(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::ORIENTATION_LANDSCAPE)
              ->setPaperSize(\PhpOffice\PhpSpreadsheet\Worksheet\PageSetup::PAPERSIZE_A4);

        $C_HDR  = '4472C4';
        $thin   = ['borderStyle' => Border::BORDER_THIN, 'color' => ['rgb' => '000000']];

        $headers = ['IBS No.', 'Emp. Name', 'Morning overtime (Hrs.)', 'Night overtime (Hrs.)',
                     'Double Pay overtime (Hrs.)', 'Deduction (Hrs.)', 'Remarks'];

        foreach ($headers as $ci => $hdr) {
            $col = Coordinate::stringFromColumnIndex($ci + 1);
            $sheet->setCellValue("{$col}2", $hdr);
        }
        $lastCol = Coordinate::stringFromColumnIndex(count($headers));
        $sheet->getStyle("A2:{$lastCol}2")->applyFromArray([
            'fill'      => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $C_HDR]],
            'font'      => ['name' => 'Arial', 'bold' => true, 'color' => ['rgb' => 'FFFFFF'], 'size' => 10],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
            'borders'   => ['allBorders' => $thin],
        ]);
        $sheet->getRowDimension(2)->setRowHeight(22);
        $sheet->setAutoFilter("A2:{$lastCol}2");

        foreach ($rows as $ri => $r) {
            $row = $ri + 3;
            $sheet->setCellValue("A{$row}", $r['ibs_code']);
            $sheet->setCellValue("B{$row}", $r['name']);
            $sheet->setCellValue("C{$row}", $r['morning_ot'] ?: '-');
            $sheet->setCellValue("D{$row}", $r['night_ot'] ?: '-');
            $sheet->setCellValue("E{$row}", $r['double_pay_ot'] ?: '-');
            $sheet->setCellValue("F{$row}", $r['deduction_hours'] ?: '-');
            $sheet->setCellValue("G{$row}", $r['remarks'] ?: '-');

            $sheet->getStyle("A{$row}:{$lastCol}{$row}")->applyFromArray([
                'font'      => ['name' => 'Arial', 'size' => 10],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER],
                'borders'   => ['allBorders' => $thin],
            ]);
            $sheet->getStyle("C{$row}:G{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        }

        $sheet->getColumnDimension('A')->setWidth(16);
        $sheet->getColumnDimension('B')->setWidth(38);
        $sheet->getColumnDimension('C')->setWidth(22);
        $sheet->getColumnDimension('D')->setWidth(20);
        $sheet->getColumnDimension('E')->setWidth(26);
        $sheet->getColumnDimension('F')->setWidth(16);
        $sheet->getColumnDimension('G')->setWidth(14);

        $writer   = new Xlsx($spreadsheet);
        $filename = "Internal_Salary_{$startDate}_{$endDate}.xlsx";

        return response()->streamDownload(
            fn() => $writer->save('php://output'),
            $filename,
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    private function calcSalaryRow(Employee $employee, $attendances, string $startDate, string $endDate, $approvedOTRs = null, $holidays = null, $approvedLeaves = null): array
    {
        $timeToMin = function($t): ?int {
            if (!$t) return null;
            $s = (string) $t;
            if (strlen($s) > 8) $s = substr($s, -8);
            return intval(substr($s,0,2))*60 + intval(substr($s,3,2));
        };

        $nightStartMin = 19 * 60;
        $totalDayOT    = 0;
        $totalNightOT  = 0;
        $doublePayOT   = 0;

        if ($approvedOTRs === null) {
            $approvedOTRs = LeaveRequest::where('type', 'otr')
                ->where('status', 'approved')
                ->where('employee_id', $employee->id)
                ->whereDate('ot_date', '>=', $startDate)
                ->whereDate('ot_date', '<=', $endDate)
                ->get();
        }
        if ($holidays === null) {
            $holidayRecs = \App\Models\PublicHoliday::query()
                ->whereDate('date', '<=', $endDate)
                ->where(function ($q) use ($startDate) {
                    $q->whereDate('end_date', '>=', $startDate)
                      ->orWhere(function ($qq) use ($startDate) {
                          $qq->whereNull('end_date')->whereDate('date', '>=', $startDate);
                      });
                })
                ->get(['date', 'end_date']);
            $holidays = [];
            foreach ($holidayRecs as $h) {
                $s = is_string($h->date) ? substr($h->date, 0, 10) : $h->date->format('Y-m-d');
                $e = $h->end_date
                    ? (is_string($h->end_date) ? substr($h->end_date, 0, 10) : $h->end_date->format('Y-m-d'))
                    : $s;
                $cur = \Carbon\Carbon::parse($s);
                $lim = \Carbon\Carbon::parse($e);
                while ($cur->lte($lim)) {
                    $d = $cur->format('Y-m-d');
                    if ($d >= $startDate && $d <= $endDate) {
                        $holidays[] = $d;
                    }
                    $cur->addDay();
                }
            }
        }
        if ($approvedLeaves === null) {
            $approvedLeaves = LeaveRequest::where('type', 'lrf')
                ->where('status', 'approved')
                ->where('employee_id', $employee->id)
                ->where(function($q) use ($startDate, $endDate) {
                    $q->whereBetween('start_date', [$startDate, $endDate])
                      ->orWhereBetween('end_date',  [$startDate, $endDate])
                      ->orWhere(function($qq) use ($startDate, $endDate) {
                          $qq->where('start_date', '<=', $startDate)
                             ->where('end_date',   '>=', $endDate);
                      });
                })
                ->get();
        }

        $empOTRs = $approvedOTRs->where('employee_id', $employee->id);

        foreach ($empOTRs as $otr) {
            $startM = $timeToMin($otr->start_time);
            $endM   = $timeToMin($otr->end_time);
            if ($startM === null || $endM === null || $endM <= $startM) continue;

            $dayMins   = max(0, min($endM, $nightStartMin) - max($startM, 17 * 60));
            $nightMins = max(0, $endM - max($startM, $nightStartMin));
            if ($dayMins < 0) $dayMins = 0;

            $totalDayOT   += (int) round($dayMins / 60);
            $totalNightOT += (int) round($nightMins / 60);
        }

        // Double Pay: hours worked on public holidays
        $holidaysSet = array_flip($holidays);
        foreach ($attendances as $att) {
            $d = is_string($att->date) ? substr($att->date, 0, 10) : ($att->date?->format('Y-m-d') ?? '');
            if (isset($holidaysSet[$d]) && $att->work_hours > 0) {
                $doublePayOT += (int) round($att->work_hours);
            }
        }

        // Deductions: absences that aren't on holidays and aren't on approved leave
        $onLeaveDates = [];
        foreach ($approvedLeaves as $lv) {
            $s = is_string($lv->start_date) ? substr($lv->start_date, 0, 10) : ($lv->start_date?->format('Y-m-d') ?? '');
            $e = is_string($lv->end_date)   ? substr($lv->end_date,   0, 10) : ($lv->end_date?->format('Y-m-d')   ?? $s);
            $cur = \Carbon\Carbon::parse($s);
            $lim = \Carbon\Carbon::parse($e);
            while ($cur->lte($lim)) { $onLeaveDates[$cur->format('Y-m-d')] = true; $cur->addDay(); }
        }
        $absentCount = 0;
        foreach ($attendances->where('status', 'absent') as $att) {
            $d = is_string($att->date) ? substr($att->date, 0, 10) : ($att->date?->format('Y-m-d') ?? '');
            if (isset($holidaysSet[$d])) continue;
            if (isset($onLeaveDates[$d])) continue;
            $absentCount++;
        }
        $deductionHrs = $absentCount * 9;

        return [
            'id'              => $employee->id,
            'ibs_code'        => $employee->ibs_code ?? '',
            'name'            => $employee->name,
            'department'      => $employee->department,
            'morning_ot'      => $totalDayOT,
            'night_ot'        => $totalNightOT,
            'double_pay_ot'   => $doublePayOT,
            'deduction_hours' => $deductionHrs,
            'remarks'         => '',
        ];
    }

    /**
     * Get raw biometric logs
     *
     * GET /api/attendance/logs
     */
    public function logs(Request $request)
    {
        $query = AttendanceLog::query();

        if ($request->filled('punch_code')) {
            $query->forPunchCode($request->punch_code);
        }
        if ($request->filled('date')) {
            $query->forDate($request->date);
        }
        if ($request->filled('processed')) {
            $query->where('processed', filter_var($request->processed, FILTER_VALIDATE_BOOLEAN));
        }

        $logs = $query->orderBy('timestamp', 'desc')->paginate(100);

        return response()->json([
            'success' => true,
            'data'    => $logs->items(),
            'pagination' => [
                'total'        => $logs->total(),
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
            ],
        ]);
    }

    /**
     * Upload attendance data from Excel file
     *
     * POST /api/attendance/upload-excel
     * Excel columns: IBS Code | Date (YYYY-MM-DD) | Check In (HH:MM) | Check Out (HH:MM)
     */
    public function uploadExcel(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $result = $this->attendanceService->importExcelFile(
                $request->file('file')->getRealPath(),
                auth()->id()
            );

            return response()->json([
                'success' => true,
                'message' => "Processed {$result['processed']} records",
                'data'    => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete attendance record
     *
     * DELETE /api/attendance/{id}
     */
    public function destroy($id)
    {
        try {
            $attendance = \App\Models\Attendance::findOrFail($id);

            // Only allow deleting manual entries
            if (!$attendance->is_manual) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete biometric attendance records',
                ], 403);
            }

            $attendance->delete();

            return response()->json([
                'success' => true,
                'message' => 'Attendance record deleted successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete attendance record',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
