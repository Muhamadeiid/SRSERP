<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Attendance;
use App\Models\PublicHoliday;
use App\Models\User;
use Carbon\Carbon;

/**
 * Simulate a full month of activity for a single test employee (id=1),
 * exercising the full HR pipeline end-to-end:
 *   • daily biometric attendance (with late/absent variations)
 *   • one approved 3-day LRF (annual leave)
 *   • one approved Early-Leave LRF (half-day morning permission)
 *   • one approved OTR (overtime request)
 *   • one Egyptian public holiday overlap
 *
 * Emails used for approvals (backdated):
 *   • Direct Manager → manager@srs.com  (id 4)
 *   • HR             → hr@srs.com       (id 8)
 *   • Depot Manager  → depot@srs.com    (id 3)
 */
class JulySimulationSeeder extends Seeder
{
    public function run(): void
    {
        $EMP_ID  = 1;
        $emp     = Employee::findOrFail($EMP_ID);
        $manager = User::where('email', 'manager@srs.com')->first();
        $hr      = User::where('email', 'hr@srs.com')->first();
        $depot   = User::where('email', 'depot@srs.com')->first();

        $start = Carbon::parse('2026-07-01');
        $end   = Carbon::parse('2026-07-31');

        // ── 1. WIPE existing July 2026 data for this employee ──
        Attendance::where('employee_id', $EMP_ID)
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->delete();
        LeaveRequest::where('employee_id', $EMP_ID)
            ->where(function($q) use ($start, $end) {
                $q->whereBetween('start_date', [$start->toDateString(), $end->toDateString()])
                  ->orWhereBetween('ot_date',   [$start->toDateString(), $end->toDateString()]);
            })
            ->delete();

        // ── 2. LRF: 3-day Annual Leave (Jul 13-15, Mon-Wed) ──
        LeaveRequest::create([
            'tracking_no'          => 'SIM-LRF-001',
            'employee_id'          => $EMP_ID,
            'employee_name'        => $emp->name,
            'job_title'            => $emp->position,
            'department'           => $emp->department,
            'type'                 => 'lrf',
            'leave_type'           => 'annual',
            'paid'                 => true,
            'available_balance'    => 21,
            'request_date'         => '2026-07-08',
            'start_date'           => '2026-07-13',
            'end_date'             => '2026-07-15',
            'days'                 => 3,
            'purpose'              => 'Family trip',
            'status'               => 'approved',
            'manager_approved_by'  => $manager?->id,
            'manager_approved_at'  => '2026-07-09 10:00:00',
            'hr_approved_by'       => $hr?->id,
            'hr_approved_at'       => '2026-07-09 14:00:00',
            'approved_by'          => $depot?->id,
            'approved_at'          => '2026-07-10 09:00:00',
        ]);

        // ── 3. LRF: Early Leave (half-day morning) Jul 20 (Mon) — permission 08:00→12:00 ──
        LeaveRequest::create([
            'tracking_no'          => 'SIM-LRF-002',
            'employee_id'          => $EMP_ID,
            'employee_name'        => $emp->name,
            'job_title'            => $emp->position,
            'department'           => $emp->department,
            'type'                 => 'lrf',
            'leave_type'           => 'early',
            'paid'                 => true,
            'available_balance'    => 18,
            'request_date'         => '2026-07-19',
            'start_date'           => '2026-07-20',
            'end_date'             => '2026-07-20',
            'days'                 => 0.5,
            'early_from'           => '08:00',
            'early_to'             => '12:00',
            'purpose'              => 'Morning appointment',
            'status'               => 'approved',
            'manager_approved_by'  => $manager?->id,
            'manager_approved_at'  => '2026-07-19 11:00:00',
            'hr_approved_by'       => $hr?->id,
            'hr_approved_at'       => '2026-07-19 12:00:00',
            'approved_by'          => $depot?->id,
            'approved_at'          => '2026-07-19 13:00:00',
        ]);

        // ── 4. OTR: 3-hour overtime on Sun Jul 5, 17:00 → 20:00 (day + night mix) ──
        LeaveRequest::create([
            'tracking_no'          => 'SIM-OTR-001',
            'employee_id'          => $EMP_ID,
            'employee_name'        => $emp->name,
            'job_title'            => $emp->position,
            'department'           => $emp->department,
            'type'                 => 'otr',
            'ot_date'              => '2026-07-05',
            'start_time'           => '17:00',
            'end_time'             => '20:00',
            'hours'                => 3,
            'explanation'          => 'Emergency line intervention support',
            'status'               => 'approved',
            'manager_approved_by'  => $manager?->id,
            'manager_approved_at'  => '2026-07-04 16:00:00',
            'hr_approved_by'       => $hr?->id,
            'hr_approved_at'       => '2026-07-04 17:00:00',
            'approved_by'          => $depot?->id,
            'approved_at'          => '2026-07-05 08:00:00',
        ]);

        // ── 5. Attendance: build daily records ──
        // CM Intervention employees: 6-day week (Fri off). Regular start 08:00, expected 9h.
        // Special days:
        //   Jul 5 (Sun) — worked till 20:00 (matches OTR)
        //   Jul 8 (Wed) — LATE by 45 minutes (unauthorized)
        //   Jul 13-15  — on leave (LRF-001)
        //   Jul 16 (Thu) — ABSENT (unauthorized) → will hit deduction
        //   Jul 20 (Mon) — clocked in 12:00 (matches early-leave permission)
        //   Jul 23 (Thu) — public holiday (Revolution Day) → work anyway → double pay
        //   Fri (Jul 3, 10, 17, 24, 31) — weekend, no record
        $offLeaveDates = ['2026-07-13','2026-07-14','2026-07-15'];
        $absentDate    = '2026-07-16';
        $lateDate      = '2026-07-08';
        $otDate        = '2026-07-05';
        $earlyDate     = '2026-07-20';
        $holidayDate   = '2026-07-23';

        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            // Skip Fridays (dow=5) — weekend for regular CM intervention (weekly off)
            if ($d->dayOfWeek === Carbon::FRIDAY) continue;

            $ds = $d->toDateString();
            if (in_array($ds, $offLeaveDates)) continue; // no attendance during approved leave

            if ($ds === $absentDate) {
                Attendance::create([
                    'employee_id' => $EMP_ID,
                    'date'        => $ds,
                    'check_in'    => null,
                    'check_out'   => null,
                    'work_hours'  => 0,
                    'overtime_hours' => 0,
                    'late_minutes'   => 0,
                    'expected_hours' => 9,
                    'status'      => 'absent',
                    'is_manual'   => false,
                ]);
                continue;
            }

            if ($ds === $lateDate) {
                Attendance::create([
                    'employee_id' => $EMP_ID,
                    'date'        => $ds,
                    'check_in'    => '08:45:00',
                    'check_out'   => '17:00:00',
                    'work_hours'  => 8.25,
                    'overtime_hours' => 0,
                    'late_minutes'   => 45,
                    'expected_hours' => 9,
                    'status'      => 'late',
                    'is_manual'   => false,
                ]);
                continue;
            }

            if ($ds === $otDate) {
                // Match the OTR window
                Attendance::create([
                    'employee_id' => $EMP_ID,
                    'date'        => $ds,
                    'check_in'    => '08:00:00',
                    'check_out'   => '20:00:00',
                    'work_hours'  => 9,
                    'overtime_hours' => 3,
                    'late_minutes'   => 0,
                    'expected_hours' => 9,
                    'status'      => 'present',
                    'is_manual'   => false,
                ]);
                continue;
            }

            if ($ds === $earlyDate) {
                // Half-day permission covered morning → clocked in 12:00
                Attendance::create([
                    'employee_id' => $EMP_ID,
                    'date'        => $ds,
                    'check_in'    => '12:00:00',
                    'check_out'   => '17:00:00',
                    'work_hours'  => 5,
                    'overtime_hours' => 0,
                    'late_minutes'   => 240, // raw calc (backend didn't know about permission)
                    'expected_hours' => 9,
                    'status'      => 'late',
                    'is_manual'   => false,
                ]);
                continue;
            }

            if ($ds === $holidayDate) {
                // Worked on holiday → double pay
                Attendance::create([
                    'employee_id' => $EMP_ID,
                    'date'        => $ds,
                    'check_in'    => '08:00:00',
                    'check_out'   => '17:00:00',
                    'work_hours'  => 9,
                    'overtime_hours' => 0,
                    'late_minutes'   => 0,
                    'expected_hours' => 9,
                    'status'      => 'present',
                    'is_manual'   => false,
                ]);
                continue;
            }

            // Normal working day
            Attendance::create([
                'employee_id' => $EMP_ID,
                'date'        => $ds,
                'check_in'    => '08:00:00',
                'check_out'   => '17:00:00',
                'work_hours'  => 9,
                'overtime_hours' => 0,
                'late_minutes'   => 0,
                'expected_hours' => 9,
                'status'      => 'present',
                'is_manual'   => false,
            ]);
        }

        // ── 6. Ensure Revolution Day holiday exists (Jul 23) ──
        PublicHoliday::firstOrCreate(
            ['date' => '2026-07-23'],
            ['end_date' => null, 'name_en' => 'Revolution Day', 'name_ar' => 'ثورة يوليو']
        );

        // ── Report ──
        $attCount = Attendance::where('employee_id', $EMP_ID)
            ->whereBetween('date', ['2026-07-01', '2026-07-31'])->count();
        $lrfCount = LeaveRequest::where('employee_id', $EMP_ID)
            ->whereIn('type', ['lrf', 'otr'])
            ->where(function($q) {
                $q->whereBetween('start_date', ['2026-07-01', '2026-07-31'])
                  ->orWhereBetween('ot_date',   ['2026-07-01', '2026-07-31']);
            })
            ->count();

        $this->command->info("Simulation for employee #{$EMP_ID} ({$emp->name}):");
        $this->command->info("  Attendance rows: {$attCount}");
        $this->command->info("  Leave/OT rows: {$lrfCount}");
    }
}
