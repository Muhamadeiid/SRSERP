<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceDailyOverviewTest extends TestCase
{
    use DatabaseTransactions;

    public function test_empty_date_is_refused_instead_of_returning_every_record(): void
    {
        Sanctum::actingAs($this->hrUser());

        $this->getJson('/api/attendance?date=')->assertStatus(422);
        $this->getJson('/api/attendance')->assertStatus(422);
        $this->getJson('/api/attendance?start_date=2096-01-01')->assertStatus(422);
    }

    public function test_employee_and_range_requests_still_work(): void
    {
        Sanctum::actingAs($this->hrUser());
        $employee = $this->employee();

        $this->getJson("/api/attendance?employee_id={$employee->id}")->assertOk();
        $this->getJson('/api/attendance?start_date=2096-01-01&end_date=2096-01-31')->assertOk();
    }

    public function test_past_day_keeps_the_punches_of_someone_who_has_left(): void
    {
        Sanctum::actingAs($this->hrUser());
        $date = '2096-03-10';
        $current = $this->employee();
        $left = $this->employee(['status' => 'terminated', 'last_working_date' => now()->subDay()->toDateString()]);
        $this->punch($current, $date);
        $punch = $this->punch($left, $date);

        $response = $this->getJson("/api/attendance?date={$date}")->assertOk();

        $this->assertContains($punch->id, collect($response->json('data'))->pluck('id')->all());
        $this->assertSame(Employee::active()->count() + 1, $response->json('total_workforce'));
    }

    private function hrUser(): User
    {
        return User::create([
            'name' => 'HR Attendance Test',
            'email' => 'hr-attendance-'.Str::lower(Str::random(8)).'@example.test',
            'password' => bcrypt('test-only'),
            'role' => 'hr',
            'department' => 'hr',
            'is_active' => true,
        ]);
    }

    private function employee(array $overrides = []): Employee
    {
        $suffix = Str::lower(Str::random(8));

        return Employee::create(array_merge([
            'ibs_code' => 'ATT-'.$suffix,
            'punch_code' => (string) random_int(50000000, 59999999),
            'name' => 'Attendance Employee '.$suffix,
            'position' => 'Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
        ], $overrides));
    }

    private function punch(Employee $employee, string $date): Attendance
    {
        return Attendance::create([
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => '06:30:00',
            'check_out' => '15:30:00',
            'work_hours' => 9,
            'expected_hours' => 8,
            'status' => 'present',
            'is_manual' => false,
        ]);
    }
}
