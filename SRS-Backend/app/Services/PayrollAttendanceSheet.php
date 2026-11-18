<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Conditional;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * The HR payroll attendance form (SRS-HR-P03-F01), one sheet per employee.
 *
 * Fonts, colours, borders, widths, labels and formulas come from the form
 * itself (resources/attendance-templates). IBS employees use the IBS layout
 * (with the IBS No and "IBS" as employer); everyone else uses the Direct
 * layout ("Rotem SRS"). Only the employee's own values are filled in.
 */
class PayrollAttendanceSheet
{
    public const LAYOUT_IBS = 'ibs';
    public const LAYOUT_DIRECT = 'direct';

    private const TABLE_COLUMNS = 'DEFGHIJKLMNOPQRS';
    private const DAY_OFF_FILL = 'D9D9D9';
    private const ABSENCE_FILL = 'FF0000';
    private const NIGHT_START_MINUTES = 19 * 60;

    /** @var array<string, array> */
    private array $templates = [];

    public function __construct(
        private AttendanceService $attendanceService,
        private AbsenceDeductionService $absenceDeductions,
    ) {
    }

    /** Direct when the employee is insured directly or budgeted as Direct Rotem SRS. */
    public static function layoutFor(object $employee): string
    {
        $insurance = strtolower(trim((string) ($employee->insurance_company ?? '')));
        $budget = strtolower(trim((string) ($employee->project_budget ?? '')));

        return $insurance === 'direct' || str_starts_with($budget, 'direct') ? self::LAYOUT_DIRECT : self::LAYOUT_IBS;
    }

    /** Short sheet name used on the form: the first two words of the name. */
    public static function sheetName(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];

        return implode(' ', array_slice($words, 0, 2)) ?: 'Employee';
    }

    public function newWorkbook(): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);
        $spreadsheet->getDefaultStyle()->getFont()->setName('Calibri')->setSize(11);

        return $spreadsheet;
    }

    public function fill(Worksheet $sheet, Employee $employee, string $startDate, string $endDate, string $projectName): void
    {
        $layout = self::layoutFor($employee);
        $tpl = $this->template($layout);
        $first = $tpl['firstDataRow'];
        $days = $this->days($employee, $startDate, $endDate);
        $last = $first + max(count($days), 1) - 1;

        $this->drawTemplate($sheet, $tpl);
        $this->fillEmployee($sheet, $tpl, $employee, $projectName, $layout);
        $this->fillTotals($sheet, $tpl, $first, $last);
        $this->fillDays($sheet, $tpl, $days);
        $this->warnLateAndEarly($sheet, $first, $last);
        $this->whiteBackground($sheet, $tpl, $last);
        $this->pageSetup($sheet, $tpl, max($tpl['lastLeftRow'], $last) + 1);
    }

    private function template(string $layout): array
    {
        return $this->templates[$layout] ??= json_decode(
            file_get_contents(resource_path("attendance-templates/payroll-{$layout}.json")),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
    }

    private function drawTemplate(Worksheet $sheet, array $tpl): void
    {
        foreach ($tpl['colWidths'] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
        foreach ($tpl['rowHeights'] as $row => $height) {
            $sheet->getRowDimension((int) $row)->setRowHeight($height);
        }
        foreach ($tpl['cells'] as $address => $cell) {
            $sheet->getStyle($address)->applyFromArray($this->style($cell['style']));
            if (array_key_exists('formula', $cell)) {
                $this->formula($sheet, $address, $cell['formula']);
            } elseif (array_key_exists('value', $cell)) {
                $sheet->setCellValue($address, $cell['value']);
            }
        }
        foreach ($tpl['merges'] as $range) {
            $sheet->mergeCells($range);
        }
        $sheet->getSheetView()->setZoomScale((int) ($tpl['zoom'] ?: 100));
    }

    /**
     * Exports store text starting with "=" as text (FormulaSafeValueBinder), so
     * the form's own formulas are written explicitly. Employee data never is.
     */
    private function formula(Worksheet $sheet, string $address, string $formula): void
    {
        $sheet->setCellValueExplicit($address, $formula, DataType::TYPE_FORMULA);
    }

    /** Row of the left-panel label in column B (or A for the summary block). */
    private function rowOf(array $tpl, string $label, string $column = 'B'): ?int
    {
        foreach ($tpl['cells'] as $address => $cell) {
            if ($address[0] === $column && trim((string) ($cell['value'] ?? '')) === $label) {
                return (int) substr($address, 1);
            }
        }

        return null;
    }

    private function fillEmployee(Worksheet $sheet, array $tpl, Employee $employee, string $projectName, string $layout): void
    {
        $balance = LeaveBalance::where('employee_id', $employee->id)->first();
        $annualTotal = (float) ($balance?->annual ?? 21);
        $casualTotal = (float) ($balance?->casual ?? 7);
        $annualRemaining = (float) ($balance?->annual_remaining ?? $annualTotal);
        $casualRemaining = (float) ($balance?->casual_remaining ?? $casualTotal);
        // Casual leave is drawn from the annual pool: the form keeps them apart
        $consumedCasual = max(0, $casualTotal - $casualRemaining);
        $consumedAnnual = max(0, ($annualTotal - $annualRemaining) - $consumedCasual);

        $values = [
            'IBS No' => $employee->ibs_code,
            'Project Name' => $projectName,
            'Employee Name' => $employee->name,
            'Employee ID' => $employee->punch_code,
            'Hiring Date' => $employee->hiring_date ? ExcelDate::PHPToExcel($employee->hiring_date->copy()->startOfDay()) : null,
            'Title' => $employee->position,
            'Location' => $employee->work_location,
            'Department' => $employee->department,
            'No Of Warning Letter' => $employee->no_warning_letters ?: null,
            'Available Balance' => $annualTotal,
            'Conusmed Annual Balance' => $consumedAnnual,
            'Consumed Casual Balance' => $consumedCasual,
        ];
        if ($layout === self::LAYOUT_DIRECT && $balance?->leave_cycle_started_on) {
            $values['Balance Effictive Date'] = ExcelDate::PHPToExcel(Carbon::parse($balance->leave_cycle_started_on)->startOfDay());
        }

        foreach ($values as $label => $value) {
            $row = $this->rowOf($tpl, $label);
            if ($row !== null && $value !== null && $value !== '') {
                $sheet->setCellValue("C{$row}", is_numeric($value) ? $value + 0 : (string) $value);
            }
        }

        // Remaining balances always follow from the rows above
        $row = fn (string $label) => $this->rowOf($tpl, $label);
        if ($row('Remain Annual Balance') && $row('Annual Blance') && $row('Conusmed Annual Balance')) {
            $this->formula($sheet, 'C' . $row('Remain Annual Balance'), '=C' . $row('Annual Blance') . '-C' . $row('Conusmed Annual Balance'));
        }
        if ($row('Remain Casual Balance') && $row('Casual Balance') && $row('Consumed Casual Balance')) {
            $this->formula($sheet, 'C' . $row('Remain Casual Balance'), '=C' . $row('Casual Balance') . '-C' . $row('Consumed Casual Balance'));
        }
    }

    private function fillTotals(Worksheet $sheet, array $tpl, int $first, int $last): void
    {
        $sum = fn (string $column) => "=SUM({$column}{$first}:{$column}{$last})";

        foreach (['Deduction in Minutes' => 'R', 'Deduction in Hours' => 'Q', 'Over Time in Hours' => 'P'] as $label => $column) {
            if ($row = $this->rowOf($tpl, $label)) {
                $this->formula($sheet, "C{$row}", $sum($column));
            }
        }
        foreach ([
            'Total Deduction in Minutes' => 'R',
            'Total Deduction in Hours' => 'Q',
            'Total Day Over Time' => 'M',
            'Total Night Over Time' => 'N',
            'Total Double Pay Over Time' => 'O',
        ] as $label => $column) {
            if ($row = $this->rowOf($tpl, $label, 'A')) {
                $this->formula($sheet, "B{$row}", $sum($column));
            }
        }
    }

    /** @param array<int, array> $days */
    private function fillDays(Worksheet $sheet, array $tpl, array $days): void
    {
        $row = $tpl['firstDataRow'];
        foreach ($days as $index => $day) {
            $style = $tpl['dataStyle'];
            $fill = $day['absence'] ? self::ABSENCE_FILL : ($day['dayOff'] ? self::DAY_OFF_FILL : null);
            foreach (str_split(self::TABLE_COLUMNS . 'T') as $column) {
                $cellStyle = $style[$column];
                if ($fill && $column !== 'T') {
                    $cellStyle['fill'] = $fill;
                }
                $sheet->getStyle("{$column}{$row}")->applyFromArray($this->style($cellStyle));
            }
            $sheet->getRowDimension($row)->setRowHeight($tpl['dataRowHeight']);

            $sheet->setCellValue("D{$row}", $index + 1);
            $sheet->setCellValue("E{$row}", ExcelDate::PHPToExcel($day['date']->copy()->startOfDay()));
            $this->formula($sheet, "F{$row}", "=TEXT(E{$row},\"ddd\")");
            $sheet->setCellValue("G{$row}", $day['in']);
            $sheet->setCellValue("H{$row}", $day['out']);
            // Leave days show the leave type in the time columns and 0:00 here
            $day['leave'] ? $sheet->setCellValue("I{$row}", 0) : $this->formula($sheet, "I{$row}", "=H{$row}-G{$row}");
            $this->formula($sheet, "J{$row}", '=$C$29/30/9');
            $sheet->setCellValue("K{$row}", $day['otStart']);
            $sheet->setCellValue("L{$row}", $day['otEnd']);
            $sheet->setCellValue("M{$row}", $day['dayOt'] ?: null);
            $sheet->setCellValue("N{$row}", $day['nightOt'] ?: null);
            $this->formula($sheet, "P{$row}", "=M{$row}+N{$row}+O{$row}");
            $sheet->setCellValue("Q{$row}", $day['deductionHours']);
            $sheet->setCellValue("S{$row}", $day['notes'] !== '' ? $day['notes'] : null);
            $row++;
        }
    }

    /** The form is white around the panels, without Excel's gridlines. */
    private function whiteBackground(Worksheet $sheet, array $tpl, int $lastDataRow): void
    {
        $bottom = max($tpl['lastLeftRow'], $lastDataRow) + 2;
        $white = ['fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'FFFFFF'], 'endColor' => ['rgb' => 'FFFFFF']]];
        $sheet->getStyle('D' . ($lastDataRow + 1) . ":T{$bottom}")->applyFromArray($white);
        $sheet->getStyle('A' . ($tpl['lastLeftRow'] + 1) . ":C{$bottom}")->applyFromArray($white);
    }

    /** Red, as on the form: check-in after 8:01, check-out before 17:00. */
    private function warnLateAndEarly(Worksheet $sheet, int $first, int $last): void
    {
        $rule = function (string $formula): Conditional {
            $conditional = new Conditional();
            $conditional->setConditionType(Conditional::CONDITION_EXPRESSION)->addCondition($formula);
            $conditional->getStyle()->getFill()->setFillType(Fill::FILL_SOLID)->getEndColor()->setRGB(self::ABSENCE_FILL);
            $conditional->getStyle()->getFill()->getStartColor()->setRGB(self::ABSENCE_FILL);

            return $conditional;
        };

        $sheet->getStyle("G{$first}:G{$last}")->setConditionalStyles([$rule("AND(ISNUMBER(G{$first}),G{$first}>TIME(8,1,0))")]);
        $sheet->getStyle("H{$first}:H{$last}")->setConditionalStyles([$rule("AND(ISNUMBER(H{$first}),H{$first}<TIME(17,0,0))")]);
    }

    private function pageSetup(Worksheet $sheet, array $tpl, int $lastRow): void
    {
        $sheet->getPageSetup()
            ->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)
            ->setPaperSize(PageSetup::PAPERSIZE_A4)
            ->setFitToPage(true)->setFitToWidth(1)->setFitToHeight(1)
            ->setPrintArea("A1:T{$lastRow}");
        $margins = $tpl['page']['margins'];
        $sheet->getPageMargins()->setTop($margins['top'])->setBottom($margins['bottom'])
            ->setLeft($margins['left'])->setRight($margins['right']);
        $sheet->getHeaderFooter()
            ->setOddHeader('&C' . $tpl['page']['centerHeader'])
            ->setOddFooter('&L' . $tpl['page']['leftFooter'] . '&R' . $tpl['page']['rightFooter']);
    }

    /** Template style entry → PhpSpreadsheet style array. */
    private function style(array $style): array
    {
        $result = [
            'font' => [
                'name' => $style['font']['name'],
                'size' => $style['font']['size'],
                'bold' => $style['font']['bold'],
                'italic' => $style['font']['italic'],
                'color' => ['rgb' => $style['font']['color']],
            ],
            'numberFormat' => ['formatCode' => $style['numFmt']],
            'alignment' => ['horizontal' => $style['h'], 'vertical' => $style['v'], 'wrapText' => $style['wrap']],
        ];
        if (!empty($style['fill'])) {
            $result['fill'] = ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => $style['fill']], 'endColor' => ['rgb' => $style['fill']]];
        }
        foreach ($style['borders'] ?? [] as $edge => $border) {
            $result['borders'][$edge] = ['borderStyle' => $border['style'], 'color' => ['rgb' => $border['color']]];
        }

        return $result;
    }

    /**
     * One entry per day of the period with what the form shows for it.
     *
     * @return array<int, array>
     */
    private function days(Employee $employee, string $startDate, string $endDate): array
    {
        $attendances = $this->attendanceService->getAttendance([
            'employee_id' => $employee->id,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);
        $leaves = LeaveRequest::where('employee_id', $employee->id)
            ->where('type', 'lrf')
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->whereDate('start_date', '<=', $endDate)
            ->whereDate('end_date', '>=', $startDate)
            ->get();
        $absences = $this->absenceDeductions->forEmployee($employee, $startDate, $endDate);
        $isIntervention = $employee->isIntervention();

        $minutes = function ($time): ?int {
            if (!$time) return null;
            $text = $time instanceof Carbon ? $time->format('H:i:s') : (string) $time;
            $text = strlen($text) > 8 ? substr($text, -8) : $text;
            return (int) substr($text, 0, 2) * 60 + (int) substr($text, 3, 2);
        };
        $fraction = fn (?int $m) => $m === null ? null : $m / 1440;

        $days = [];
        for ($date = Carbon::parse($startDate); $date->lte(Carbon::parse($endDate)); $date->addDay()) {
            $key = $date->toDateString();
            $record = $attendances->first(fn ($a) => $a->date?->format('Y-m-d') === $key);
            $dayLeaves = $leaves->filter(function ($leave) use ($key) {
                $from = $leave->start_date?->toDateString();
                $to = $leave->end_date?->toDateString() ?? $from;
                return $from && $from <= $key && $to >= $key;
            });
            $fullDay = $dayLeaves->first(fn ($l) => in_array($l->leave_type, ['annual', 'casual', 'sick'], true));
            $companyPaid = $dayLeaves->first(fn ($l) => (bool) $l->company_paid);
            $early = $dayLeaves->first(fn ($l) => $l->leave_type === 'early');
            $absence = $absences[$key] ?? null;
            $dayOff = $record?->status === 'off' || !$employee->isWorkingDay($date->copy()) || (bool) $companyPaid;

            $in = $minutes($record?->check_in);
            $out = $minutes($record?->check_out);
            $leaveLabel = $fullDay ? ['annual' => 'Annual', 'casual' => 'Casual', 'sick' => 'Sick'][$fullDay->leave_type] : null;

            // Overtime as on the form: from 17:00 (or the end of an intervention
            // shift) to check-out, split at 19:00 into day and night hours
            $otStart = $otEnd = null;
            $dayOt = $nightOt = 0;
            if ($record && (float) $record->overtime_hours > 0 && $out !== null) {
                $from = $isIntervention
                    ? ($in !== null ? $in + (int) (($record->expected_hours ?? 9) * 60) : null)
                    : 17 * 60;
                if ($from !== null && $out > $from) {
                    $otStart = $fraction($from);
                    $otEnd = $fraction($out);
                    $dayOt = (int) round(max(0, min($out, self::NIGHT_START_MINUTES) - $from) / 60);
                    $nightOt = (int) round(max(0, $out - max($from, self::NIGHT_START_MINUTES)) / 60);
                }
            }

            $notes = $companyPaid ? trim((string) $companyPaid->purpose) : trim((string) ($record?->notes ?? ''));
            if ($early) {
                if (preg_match('/^(?:إذن|اذن|permission)\s*\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/iu', $notes)) {
                    $notes = '';
                }
                $elr = 'ELR ' . rtrim(rtrim(number_format((float) $early->days, 2, '.', ''), '0'), '.');
                $notes = $notes === '' ? $elr : "{$notes} | {$elr}";
            }

            $days[] = [
                'date' => $date->copy(),
                'in' => $leaveLabel ?? $fraction($in),
                'out' => $leaveLabel ?? $fraction($out),
                'leave' => (bool) $leaveLabel,
                'dayOff' => $dayOff,
                'absence' => (bool) $absence,
                'deductionHours' => $absence ? (float) $absence['deduction_hours'] : null,
                'otStart' => $otStart,
                'otEnd' => $otEnd,
                'dayOt' => $dayOt,
                'nightOt' => $nightOt,
                'notes' => $notes,
            ];
        }

        return $days;
    }
}
