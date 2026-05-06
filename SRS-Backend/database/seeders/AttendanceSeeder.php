<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class AttendanceSeeder extends Seeder
{
    public function run(): void
    {
        Attendance::truncate();

        $employees = Employee::whereNotNull('punch_code')->get();
        if ($employees->isEmpty()) {
            $this->command->warn('No employees found. Run EmployeeSeeder first.');
            return;
        }

        // ── Auto-assign schedule fields if not already set ─────────────
        $groupToggle = 'A';
        foreach ($employees as $emp) {
            $changed = false;

            if ($emp->isIntervention()) {
                // Intervention: random day off (0=Sun … 4=Thu, never Fri/Sat)
                if ($emp->weekly_off_day === null) {
                    $emp->weekly_off_day = rand(0, 4); // Sun–Thu
                    $changed = true;
                }
            } else {
                // Regular: assign alternating Saturday groups
                if ($emp->saturday_group === null) {
                    $emp->saturday_group = $groupToggle;
                    $groupToggle = ($groupToggle === 'A') ? 'B' : 'A';
                    $changed = true;
                }
            }

            if ($changed) $emp->save();
        }

        // ── Seed last 2 full months + current month so far ─────────────
        $start = Carbon::now()->subMonths(2)->startOfMonth();
        $end   = Carbon::now()->subDay();

        $this->command->info(
            "Seeding attendance from {$start->toDateString()} to {$end->toDateString()} " .
            "for {$employees->count()} employees…"
        );

        foreach ($employees as $emp) {
            $isIntervention = $emp->isIntervention();
            $current = $start->copy();

            while ($current->lte($end)) {

                // Skip non-working days using the employee's own schedule
                if (!$emp->isWorkingDay($current)) {
                    $current->addDay();
                    continue;
                }

                // 5 % chance absent
                if (rand(1, 100) <= 5) {
                    Attendance::create([
                        'employee_id'    => $emp->id,
                        'date'           => $current->toDateString(),
                        'check_in'       => null,
                        'check_out'      => null,
                        'work_hours'     => 0,
                        'expected_hours' => 9,
                        'late_minutes'   => 0,
                        'overtime_hours' => 0,
                        'status'         => 'absent',
                        'is_manual'      => false,
                    ]);
                    $current->addDay();
                    continue;
                }

                // ── Generate check-in ──────────────────────────────────
                if ($isIntervention) {
                    // Variable shift: can start anywhere 06:00 – 16:00
                    $inMin = rand(360, 960);  // 06:00 – 16:00
                } else {
                    // Regular: mostly on time around 08:00
                    $lateProb = rand(1, 100);
                    if ($lateProb <= 10) {
                        $inMin = 480 + rand(16, 45); // very late
                    } elseif ($lateProb <= 25) {
                        $inMin = 480 + rand(5, 15);  // slightly late
                    } else {
                        $inMin = 480 + rand(-5, 5);  // on time
                    }
                    $inMin = max(420, $inMin); // never before 07:00
                }

                // 3 % chance: no check-out
                if (rand(1, 100) <= 3) {
                    Attendance::create([
                        'employee_id'    => $emp->id,
                        'date'           => $current->toDateString(),
                        'check_in'       => sprintf('%02d:%02d:00', intdiv($inMin, 60), $inMin % 60),
                        'check_out'      => null,
                        'work_hours'     => 0,
                        'expected_hours' => 9,
                        'late_minutes'   => $isIntervention ? 0 : max(0, $inMin - 480),
                        'overtime_hours' => 0,
                        'status'         => 'incomplete',
                        'is_manual'      => false,
                    ]);
                    $current->addDay();
                    continue;
                }

                // ── Generate check-out (9 h shift ± OT / shortage) ────
                $otProb = rand(1, 100);
                $outMin = $inMin + (9 * 60);
                if ($otProb <= 15)      $outMin += rand(30, 120); // OT 30 min–2 h
                elseif ($otProb <= 25)  $outMin -= rand(30, 90);  // shortage

                $workMin  = $outMin - $inMin;
                $workHrs  = round($workMin / 60, 2);
                $lateMin  = $isIntervention ? 0 : max(0, $inMin - 480);
                $otHrs    = round(max(0, $workHrs - 9), 2);

                if ($workHrs <= 0) {
                    $status = 'incomplete';
                } elseif ($isIntervention) {
                    // For intervention, only OT / shortage / present matter
                    $status = ($workHrs < 9) ? 'shortage' : 'present';
                } else {
                    if ($workHrs < 9) {
                        $status = ($lateMin > 15) ? 'late' : 'shortage';
                    } elseif ($lateMin > 15) {
                        $status = 'late';
                    } else {
                        $status = 'present';
                    }
                }

                Attendance::create([
                    'employee_id'    => $emp->id,
                    'date'           => $current->toDateString(),
                    'check_in'       => sprintf('%02d:%02d:00', intdiv($inMin, 60), $inMin % 60),
                    'check_out'      => sprintf('%02d:%02d:00', intdiv($outMin, 60), $outMin % 60),
                    'work_hours'     => $workHrs,
                    'expected_hours' => 9,
                    'late_minutes'   => $lateMin,
                    'overtime_hours' => $otHrs,
                    'status'         => $status,
                    'is_manual'      => false,
                ]);

                $current->addDay();
            }
        }

        $total = Attendance::count();
        $this->command->info("✅ Done — {$total} attendance records created.");
    }
}
