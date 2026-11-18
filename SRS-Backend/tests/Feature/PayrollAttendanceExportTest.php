<?php

namespace Tests\Feature;

use App\Http\Controllers\AttendanceController;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveBalance;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use ReflectionMethod;
use Tests\TestCase;

class PayrollAttendanceExportTest extends TestCase
{
    use DatabaseTransactions;

    private const START = '2096-10-21';
    private const END = '2096-11-20';

    public function test_employees_split_into_project_and_employer_files(): void
    {
        $ibs = $this->employee('Hazem Khaled Aldawi', 'CML1-RSRSE-001', 'IBS');
        $direct = $this->employee('Ahmed Mohamed Elsayed Nassar', 'Ganz-RSRSE-0052', 'Direct');
        $budgetDirect = $this->employee('Mohamed Awaad Hussein', 'Direct Rotem SRS', null);
        $ganzIbs = $this->employee('Yasser Hassan Gouda', 'Ganz-RSRSE-0052', null);

        $groups = $this->invokePrivate('employeesByExportGroup', Employee::whereIn('id', [$ibs->id, $direct->id, $budgetDirect->id, $ganzIbs->id])->get());

        $this->assertSame(['cml1-ibs', 'cml1-direct', 'gz-ibs', 'gz-direct'], array_keys($groups));
        $this->assertSame([$ibs->id], $groups['cml1-ibs']['employees']->pluck('id')->all());
        $this->assertSame([$budgetDirect->id], $groups['cml1-direct']['employees']->pluck('id')->all());
        $this->assertSame([$ganzIbs->id], $groups['gz-ibs']['employees']->pluck('id')->all());
        $this->assertSame([$direct->id], $groups['gz-direct']['employees']->pluck('id')->all());
        $this->assertMatchesRegularExpression('/^SRS-HR-P03-F01 PAS-GZ-\d{6} Direct\.xlsx$/', $groups['gz-direct']['file']);
    }

    public function test_ibs_sheet_follows_the_form_and_fills_the_employee(): void
    {
        $employee = $this->employee('Hazem Khaled Aldawi', 'CML1-RSRSE-001', 'IBS', '457870');
        LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'annual_remaining' => 13.25, 'casual' => 7, 'casual_remaining' => 5, 'sick' => 90, 'early' => 0]);
        $this->day($employee, '2096-10-21', '10:00:00', '17:09:00');

        $sheet = $this->reload($this->invokePrivate('buildAttendanceWorkbook', collect([$employee]), self::START, self::END, 'Line1'), 'ibs')->getSheet(0);

        $this->assertSame('Hazem Khaled', $sheet->getTitle());
        $this->assertSame('Employee Data', $sheet->getCell('A2')->getValue());
        $this->assertSame('IBS No', $sheet->getCell('B2')->getValue());
        $this->assertEquals(457870, $sheet->getCell('C2')->getValue());
        $this->assertSame('Line1', $sheet->getCell('C3')->getValue());
        $this->assertSame('Hazem Khaled Aldawi', $sheet->getCell('C4')->getValue());
        $this->assertSame('IBS', $sheet->getCell('C12')->getValue());
        // Consumed casual 2; consumed annual = (21 - 13.25) - 2
        $this->assertEquals(5.75, $sheet->getCell('C17')->getValue());
        $this->assertEquals(2, $sheet->getCell('C18')->getValue());
        $this->assertSame('=C15-C17', $sheet->getCell('C19')->getValue());
        $this->assertSame('=SUM(R4:R34)', $sheet->getCell('C23')->getValue());
        $this->assertSame('=SUM(Q4:Q34)', $sheet->getCell('B39')->getValue());

        $this->assertSame('Sn', $sheet->getCell('D3')->getValue());
        $this->assertSame('Notes', $sheet->getCell('S3')->getValue());
        $this->assertEquals(ExcelDate::PHPToExcel(new \DateTime('2096-10-21')), $sheet->getCell('E4')->getValue());
        $this->assertEqualsWithDelta(10 / 24, $sheet->getCell('G4')->getValue(), 0.0001);
        $this->assertSame('=H4-G4', $sheet->getCell('I4')->getValue());
        $this->assertSame('=M4+N4+O4', $sheet->getCell('P4')->getValue());
        $this->assertSame('Gill Sans MT', $sheet->getStyle('D3')->getFont()->getName());
        $this->assertSame('BDD7EE', $sheet->getStyle('C3')->getFill()->getStartColor()->getRGB());
        $this->assertContains('A2:A11', array_keys($sheet->getMergeCells()));
        $this->assertNotEmpty($sheet->getStyle('G4:G34')->getConditionalStyles());
        $this->assertStringContainsString('Payroll Attendance Sheet', $sheet->getHeaderFooter()->getOddHeader());
    }

    public function test_direct_sheet_uses_the_direct_layout(): void
    {
        $employee = $this->employee('Ahmed Mohamed Elsayed Nassar', 'Ganz-RSRSE-0052', 'Direct');

        $sheet = $this->reload($this->invokePrivate('buildAttendanceWorkbook', collect([$employee]), self::START, self::END, 'Ganz'), 'direct')->getSheet(0);

        $this->assertSame('Project Name', $sheet->getCell('B2')->getValue());
        $this->assertSame('Ganz', $sheet->getCell('C2')->getValue());
        $this->assertSame('Rotem SRS', $sheet->getCell('C11')->getValue());
        $this->assertSame('Sn', $sheet->getCell('D2')->getValue());
        $this->assertSame('Total Over Time', $sheet->getCell('P2')->getValue());
        $this->assertSame('=SUM(R3:R33)', $sheet->getCell('C22')->getValue());
        $this->assertEquals(ExcelDate::PHPToExcel(new \DateTime('2096-10-21')), $sheet->getCell('E3')->getValue());
    }

    private function invokePrivate(string $method, ...$args)
    {
        $controller = app(AttendanceController::class);
        $reflection = new ReflectionMethod($controller, $method);
        $reflection->setAccessible(true);

        return $reflection->invoke($controller, ...$args);
    }

    /** Saves and reopens the workbook, keeping a copy to look at when asked. */
    private function reload($spreadsheet, string $name)
    {
        $path = tempnam(sys_get_temp_dir(), 'payroll').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);
        if ($dir = getenv('PAYROLL_SAMPLE_DIR')) {
            copy($path, "{$dir}/payroll-{$name}.xlsx");
        }
        $reloaded = IOFactory::load($path);
        @unlink($path);

        return $reloaded;
    }

    private function employee(string $name, string $budget, ?string $insurance, ?string $ibsCode = null): Employee
    {
        $suffix = Str::lower(Str::random(6));

        return Employee::create([
            'ibs_code' => $ibsCode ?? (string) random_int(500000, 599999),
            'punch_code' => (string) random_int(70000000, 79999999),
            'name' => $name,
            'position' => 'HR Officer',
            'department' => 'HR - Line 1',
            'work_location' => 'Kozzika',
            'status' => 'on_site',
            'project_budget' => $budget,
            'insurance_company' => $insurance,
            'hiring_date' => '2096-01-22',
            'rotem_code' => 'PAY-'.$suffix,
        ]);
    }

    private function day(Employee $employee, string $date, string $in, string $out): void
    {
        Attendance::create([
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => $in,
            'check_out' => $out,
            'work_hours' => 7,
            'expected_hours' => 9,
            'overtime_hours' => 0.15,
            'status' => 'late',
            'is_manual' => false,
        ]);
    }
}
