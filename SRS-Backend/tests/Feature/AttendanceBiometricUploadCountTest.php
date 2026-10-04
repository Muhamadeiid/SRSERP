<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Attendance;
use App\Services\AttendanceService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceBiometricUploadCountTest extends TestCase
{
    use DatabaseTransactions;

    public function test_upload_reports_matched_people_even_when_the_file_is_uploaded_again(): void
    {
        $suffix = Str::lower(Str::random(8));
        $user = User::create([
            'name' => 'Attendance Upload Test Admin',
            'email' => "attendance-upload-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'admin',
            'department' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $codeOne = (string) random_int(70000000, 79999999);
        $codeTwo = (string) random_int(80000000, 89999999);

        foreach ([$codeOne, $codeTwo] as $index => $punchCode) {
            Employee::create([
                'ibs_code' => 'ATT-' . $suffix . '-' . ($index + 1),
                'punch_code' => $punchCode,
                'name' => 'Attendance Upload Test Employee ' . ($index + 1),
                'position' => 'Test Technician',
                'department' => 'cm_intervention',
                'work_location' => 'Mainline',
                'status' => 'on_site',
            ]);
        }

        $date = now()->toDateString();
        $content = implode("\n", [
            "{$codeOne} {$date} 07:55:00 1 0 TEST01 0",
            "{$codeOne} {$date} 17:05:00 1 5 TEST01 0",
            "{$codeTwo} {$date} 07:50:00 1 0 TEST02 0",
            "{$codeTwo} {$date} 17:10:00 1 5 TEST02 0",
        ]);

        $this->postJson('/api/attendance/upload', [
            'file' => UploadedFile::fake()->createWithContent('attendance.dat', $content),
        ])->assertOk()
            ->assertJsonPath('file_records', 4)
            ->assertJsonPath('employees_count', 2)
            ->assertJsonPath('data.file_records', 4)
            ->assertJsonPath('data.employees_count', 2)
            ->assertJsonPath('data.punch_codes_count', 2)
            ->assertJsonPath('data.imported', 4)
            ->assertJsonPath('data.processed', 2);

        $this->postJson('/api/attendance/upload', [
            'file' => UploadedFile::fake()->createWithContent('attendance.dat', $content),
        ])->assertOk()
            ->assertJsonPath('file_records', 4)
            ->assertJsonPath('employees_count', 2)
            ->assertJsonPath('data.file_records', 4)
            ->assertJsonPath('data.employees_count', 2)
            ->assertJsonPath('data.punch_codes_count', 2)
            ->assertJsonPath('data.imported', 0)
            ->assertJsonPath('data.processed', 2);

        $employee = Employee::where('punch_code', $codeOne)->firstOrFail();
        $manual = app(AttendanceService::class)->createManualEntry([
            'employee_id' => $employee->id,
            'date' => $date,
            'check_in' => '08:00',
            'check_out' => '18:00',
            'status' => 'permission',
            'notes' => 'Reviewed manual correction',
        ], $user->id);
        $before = $manual->fresh()->getAttributes();

        // Both a duplicate upload and a later upload containing new punches
        // must preserve every field of the manually reviewed day.
        foreach ([$content, $content . "\n{$codeOne} {$date} 19:00:00 1 5 TEST01 0\n{$codeTwo} {$date} 19:00:00 1 5 TEST02 0"] as $upload) {
            $this->postJson('/api/attendance/upload', [
                'file' => UploadedFile::fake()->createWithContent('attendance.dat', $upload),
            ])->assertOk();
            $this->assertSame($before, $manual->fresh()->getAttributes());
        }
        $this->assertDatabaseHas('attendance_logs', [
            'punch_code' => $codeOne,
            'timestamp' => $date . ' 19:00:00',
            'processed' => true,
        ]);
        $this->assertSame('19:00:00', Attendance::where('employee_id', Employee::where('punch_code', $codeTwo)->firstOrFail()->id)
            ->whereDate('date', $date)->firstOrFail()->check_out);
    }
}
