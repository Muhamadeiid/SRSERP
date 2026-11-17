<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Services\AttendanceService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

class AttendanceManualCheckOutTest extends TestCase
{
    use DatabaseTransactions;

    private const DATE = '2096-11-16';

    public function test_device_check_out_completes_a_manual_check_in(): void
    {
        $employee = $this->employee();
        $this->manualDay($employee, ['check_in' => '07:52:00', 'status' => 'present']);

        $this->upload($employee, ['17:10:33']);

        $day = $this->day($employee);
        $this->assertSame('07:52:00', $day->check_in);
        $this->assertSame('17:10:33', $day->check_out);
        $this->assertSame('present', $day->status);
        $this->assertTrue($day->is_manual);
        $this->assertGreaterThan(9, (float) $day->work_hours);
    }

    public function test_a_manual_check_out_is_never_replaced(): void
    {
        $employee = $this->employee();
        $this->manualDay($employee, ['check_in' => '07:52:00', 'check_out' => '16:00:00', 'status' => 'shortage']);

        $this->upload($employee, ['17:10:33']);

        $day = $this->day($employee);
        $this->assertSame('16:00:00', $day->check_out);
        $this->assertSame('shortage', $day->status);
    }

    public function test_a_punch_right_after_the_manual_check_in_is_not_a_check_out(): void
    {
        $employee = $this->employee();
        $this->manualDay($employee, ['check_in' => '07:52:00', 'status' => 'present']);

        $this->upload($employee, ['08:01:00']);

        $this->assertNull($this->day($employee)->check_out);
    }

    private function employee(): Employee
    {
        $suffix = Str::lower(Str::random(8));

        return Employee::create([
            'ibs_code' => 'MCO-'.$suffix,
            'punch_code' => (string) random_int(60000000, 69999999),
            'name' => 'Manual Check Out '.$suffix,
            'position' => 'Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
        ]);
    }

    private function manualDay(Employee $employee, array $values): void
    {
        Attendance::create(array_merge([
            'employee_id' => $employee->id,
            'date' => self::DATE,
            'check_out' => null,
            'work_hours' => 0,
            'expected_hours' => 9,
            'is_manual' => true,
        ], $values));
    }

    private function upload(Employee $employee, array $times): void
    {
        $lines = array_map(fn ($time) => "   {$employee->punch_code}\t".self::DATE." {$time}\t1\t0\t1\t0", $times);
        $file = tempnam(sys_get_temp_dir(), 'attlog');
        file_put_contents($file, implode("\r\n", $lines)."\r\n");

        try {
            $result = app(AttendanceService::class)->importBiometricFile($file);
            $this->assertTrue($result['success']);
        } finally {
            @unlink($file);
        }
    }

    private function day(Employee $employee): Attendance
    {
        return Attendance::where('employee_id', $employee->id)->whereDate('date', self::DATE)->firstOrFail();
    }
}
