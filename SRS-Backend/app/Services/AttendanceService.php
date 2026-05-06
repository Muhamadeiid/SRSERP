<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendanceLog;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AttendanceService
{
    /**
     * Parse and import .dat file
     *
     * @param string $filePath
     * @return array
     */
    public function importBiometricFile(string $filePath): array
    {
        $imported = 0;
        $errors   = [];
        $dates    = [];

        try {
            $content = file_get_contents($filePath);
            $lines = explode("\n", trim($content));

            DB::beginTransaction();

            foreach ($lines as $lineNum => $line) {
                $line = trim($line);
                if (empty($line)) continue;

                // Parse line: [punch_code] [timestamp] [col3] [col4] [device_id] [col6]
                $parts = preg_split('/\s+/', $line);

                if (count($parts) < 6) {
                    $errors[] = "Line {$lineNum}: Invalid format";
                    continue;
                }

                try {
                    // .dat format: punch_code | date | time | flag | direction(0=in,5=out) | device_id | flag
                    // Some devices record after-midnight as 24+h (e.g. 26:18:00 = 2:18 AM next day)
                    $timeStr  = $parts[2];
                    $timeParts = explode(':', $timeStr);
                    $hour = (int) ($timeParts[0] ?? 0);
                    if ($hour >= 24) {
                        $extraDays = intdiv($hour, 24);
                        $timeParts[0] = str_pad($hour % 24, 2, '0', STR_PAD_LEFT);
                        $timeStr = implode(':', $timeParts);
                        $dateStr = Carbon::parse($parts[1])->addDays($extraDays)->toDateString();
                    } else {
                        $dateStr = $parts[1];
                    }
                    $ts        = Carbon::parse($dateStr . ' ' . $timeStr);
                    $punchCode = trim($parts[0]);

                    // Always track dates from the file (even duplicates) so we can
                    // force-reprocess them if no new rows were inserted.
                    $dates[] = $ts->toDateString();

                    // insertOrIgnore: the DB unique constraint on (punch_code, timestamp)
                    // is the real guard — this just skips silently on duplicates.
                    $affected = \Illuminate\Support\Facades\DB::table('attendance_logs')->insertOrIgnore([
                        'punch_code' => $punchCode,
                        'timestamp'  => $ts,
                        'device_id'  => $parts[5] ?? null,
                        'source'     => 'biometric',
                        'raw_data'   => json_encode($parts),
                        'processed'  => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    if ($affected) $imported++;
                } catch (\Exception $e) {
                    $errors[] = "Line {$lineNum}: " . $e->getMessage();
                }
            }

            $uniqueDates = array_values(array_unique($dates));

            // If all records were duplicates (file already uploaded before),
            // reset processed=false for those dates so they get re-processed
            // with the latest logic (e.g. after a bug fix).
            if ($imported === 0 && !empty($uniqueDates)) {
                DB::table('attendance_logs')
                    ->whereIn(DB::raw('DATE(timestamp)'), $uniqueDates)
                    ->update(['processed' => false, 'updated_at' => now()]);
            }

            DB::commit();

            // Now process the logs into attendance records
            $processed = $this->processUnprocessedLogs();

            return [
                'success'   => true,
                'imported'  => $imported,
                'processed' => $processed,
                'dates'     => $uniqueDates,
                'errors'    => $errors,
            ];

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Biometric import failed: ' . $e->getMessage());

            return [
                'success' => false,
                'message' => $e->getMessage(),
                'errors' => $errors,
            ];
        }
    }

    /**
     * Process unprocessed attendance logs into attendance records
     *
     * @return int Number of records processed
     */
    public function processUnprocessedLogs(): int
    {
        $unprocessedLogs = AttendanceLog::unprocessed()
            ->orderBy('timestamp')
            ->get();

        // Group by punch_code and date
        $grouped = $unprocessedLogs->groupBy(function ($log) {
            return $log->punch_code . '_' . $log->timestamp->format('Y-m-d');
        });

        $processedCount = 0;

        foreach ($grouped as $key => $newLogs) {
            [$punchCode, $date] = explode('_', $key);

            // Find employee by punch_code
            $employee = Employee::where('punch_code', $punchCode)->first();
            if (!$employee) {
                Log::warning("Employee not found for punch_code: {$punchCode}");
                continue;
            }

            $expectedHours  = $this->getExpectedHours($employee);
            $isIntervention = $employee->isIntervention();

            // Direction flag (raw_data[4]) is unreliable across devices —
            // some devices record all punches as 0 or all as 5 regardless of direction.
            // Use chronological order instead: first punch = IN, last punch = OUT.
            //
            // Fetch ALL logs for this employee+date (including already-processed ones)
            // so that uploading multiple files for the same period always yields the
            // true first and last punch of the day.
            $allLogsForDay = AttendanceLog::where('punch_code', $punchCode)
                ->whereDate('timestamp', $date)
                ->orderBy('timestamp')
                ->get();

            $firstPunch  = $allLogsForDay->first()->timestamp;
            $lastPunch   = $allLogsForDay->last()->timestamp;
            $spanMinutes = $firstPunch->diffInMinutes($lastPunch);

            $standardStart = Carbon::parse($date . ' 08:00:00');
            $noon          = Carbon::parse($date . ' 12:00:00');

            if ($spanMinutes >= 30) {
                // Enough gap between first and last punch → treat as full day
                $attendanceData = $this->calculateAttendance($firstPunch, $lastPunch, $expectedHours, $isIntervention);

            } elseif ($firstPunch->lt($noon)) {
                // Clustered morning punches → check-in only, no checkout yet
                $lateMinutes = (!$isIntervention && $firstPunch->gt($standardStart))
                    ? $standardStart->diffInMinutes($firstPunch)
                    : 0;
                $attendanceData = [
                    'check_in'       => $firstPunch->format('H:i:s'),
                    'check_out'      => null,
                    'work_hours'     => 0,
                    'late_minutes'   => $lateMinutes,
                    'overtime_hours' => 0,
                    'status'         => 'incomplete',
                ];
            } else {
                // Clustered afternoon punches → these are check-out records.
                // Try to pair with an existing attendance record that has a check_in.
                $existing = Attendance::where('employee_id', $employee->id)
                    ->whereDate('date', $date)
                    ->whereNotNull('check_in')
                    ->first();

                if ($existing) {
                    $checkIn = Carbon::parse($date . ' ' . $existing->check_in);
                    $attendanceData = $this->calculateAttendance($checkIn, $lastPunch, $expectedHours, $isIntervention);
                } else {
                    // No existing check_in found — mark logs processed and skip
                    foreach ($newLogs as $log) {
                        $log->update(['processed' => true]);
                    }
                    continue;
                }
            }

            // Create or update attendance record
            Attendance::updateOrCreate(
                ['employee_id' => $employee->id, 'date' => $date],
                array_merge($attendanceData, [
                    'expected_hours' => $expectedHours,
                    'is_manual'      => false,
                ])
            );

            // Mark new logs as processed
            foreach ($newLogs as $log) {
                $log->update(['processed' => true]);
            }

            $processedCount++;
        }

        return $processedCount;
    }

    /**
     * Calculate attendance metrics.
     *
     * @param Carbon   $checkIn
     * @param Carbon   $checkOut
     * @param float    $expectedHours
     * @param bool     $isIntervention  Intervention employees have no fixed start time
     */
    private function calculateAttendance(
        Carbon $checkIn,
        Carbon $checkOut,
        float  $expectedHours,
        bool   $isIntervention = false
    ): array {
        $checkInTime  = $checkIn->format('H:i:s');
        $checkOutTime = $checkOut->format('H:i:s');

        $workMinutes  = $checkIn->diffInMinutes($checkOut);
        $workHours    = round($workMinutes / 60, 2);

        // Late minutes only apply to regular employees with a fixed 08:00 start
        $lateMinutes = 0;
        if (!$isIntervention) {
            $standardStart = Carbon::parse('08:00:00');
            $inCarbon      = Carbon::parse($checkInTime);
            if ($inCarbon->gt($standardStart)) {
                $lateMinutes = $standardStart->diffInMinutes($inCarbon);
            }
        }

        // OT calculation differs by employee type:
        // - Regular employees: OT starts at 17:00 (5 PM), regardless of check-in time.
        // - Intervention employees: OT = hours worked beyond expected shift length.
        if (!$isIntervention) {
            $otStart = Carbon::parse($checkIn->toDateString() . ' 17:00:00');
            $overtimeHours = $checkOut->gt($otStart)
                ? round($checkOut->diffInMinutes($otStart) / 60, 2)
                : 0;
        } else {
            $overtimeHours = max(0, $workHours - $expectedHours);
        }

        $status = $this->determineStatus($workHours, $expectedHours, $lateMinutes, $checkOut, $isIntervention);

        return [
            'check_in'       => $checkInTime,
            'check_out'      => $checkOutTime,
            'work_hours'     => $workHours,
            'late_minutes'   => $lateMinutes,
            'overtime_hours' => round($overtimeHours, 2),
            'status'         => $status,
        ];
    }

    /**
     * Determine attendance status.
     */
    private function determineStatus(
        float   $workHours,
        float   $expectedHours,
        int     $lateMinutes,
        ?Carbon $checkOut,
        bool    $isIntervention = false
    ): string {
        if ($checkOut === null) return 'incomplete';

        if ($workHours < $expectedHours) return 'shortage';

        // Late only meaningful for regular employees
        if (!$isIntervention && $lateMinutes > 15) return 'late';

        return 'present';
    }

    /**
     * Get expected hours for employee (always 9h).
     */
    private function getExpectedHours(Employee $employee): float
    {
        return 9.00;
    }

    /**
     * Import attendance from Excel file
     * Expected columns: IBS Code | Date | Check In | Check Out
     */
    public function importExcelFile(string $filePath, $userId): array
    {
        $processed = 0;
        $skipped   = 0;
        $errors    = [];
        $dates     = [];

        try {
            $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($filePath);
            $reader->setReadDataOnly(true);
            $spreadsheet = $reader->load($filePath);
            $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, false);

            DB::beginTransaction();

            foreach ($rows as $i => $row) {
                // Skip header row and empty rows
                if ($i === 0) continue;
                if (empty(array_filter($row))) continue;

                [$ibsCode, $date, $checkIn, $checkOut] = array_pad($row, 4, null);

                if (!$ibsCode || !$date) {
                    $errors[] = "Row " . ($i + 1) . ": Missing IBS code or date";
                    $skipped++;
                    continue;
                }

                // Find employee
                $employee = Employee::where('ibs_code', trim($ibsCode))->first();
                if (!$employee) {
                    $errors[] = "Row " . ($i + 1) . ": Employee '{$ibsCode}' not found";
                    $skipped++;
                    continue;
                }

                // Parse date
                try {
                    $dateStr = \Carbon\Carbon::parse($date)->toDateString();
                } catch (\Exception $e) {
                    $errors[] = "Row " . ($i + 1) . ": Invalid date '{$date}'";
                    $skipped++;
                    continue;
                }

                $expectedHours  = $this->getExpectedHours($employee);
                $isIntervention = $employee->isIntervention();
                $data = ['expected_hours' => $expectedHours, 'is_manual' => true, 'created_by' => $userId];

                if ($checkIn && $checkOut) {
                    $ciCarbon = Carbon::parse($dateStr . ' ' . $checkIn);
                    $coCarbon = Carbon::parse($dateStr . ' ' . $checkOut);
                    $calculated = $this->calculateAttendance($ciCarbon, $coCarbon, $expectedHours, $isIntervention);
                    $data = array_merge($data, $calculated);
                } elseif ($checkIn) {
                    $data['check_in'] = Carbon::parse($checkIn)->format('H:i:s');
                    $data['status']   = 'incomplete';
                } else {
                    $data['status'] = 'absent';
                }

                Attendance::updateOrCreate(
                    ['employee_id' => $employee->id, 'date' => $dateStr],
                    $data
                );
                $dates[] = $dateStr;
                $processed++;
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }

        return ['processed' => $processed, 'skipped' => $skipped, 'dates' => array_values(array_unique($dates ?? [])), 'errors' => $errors];
    }

    /**
     * Create manual attendance entry
     */
    public function createManualEntry(array $data, $userId): Attendance
    {
        // Calculate if check_in and check_out provided
        if (isset($data['check_in']) && isset($data['check_out'])) {
            $checkIn  = Carbon::parse($data['date'] . ' ' . $data['check_in']);
            $checkOut = Carbon::parse($data['date'] . ' ' . $data['check_out']);

            $employee       = Employee::findOrFail($data['employee_id']);
            $expectedHours  = $this->getExpectedHours($employee);
            $isIntervention = $employee->isIntervention();

            $calculated = $this->calculateAttendance($checkIn, $checkOut, $expectedHours, $isIntervention);

            $data = array_merge($data, $calculated, [
                'expected_hours' => $expectedHours,
            ]);
        }

        $data['is_manual'] = true;
        $data['created_by'] = $userId;

        return Attendance::updateOrCreate(
            [
                'employee_id' => $data['employee_id'],
                'date' => $data['date'],
            ],
            $data
        );
    }

    /**
     * Get attendance records with filters
     */
    public function getAttendance(array $filters = [])
    {
        $query = Attendance::with(['employee', 'creator']);

        // Filter by employee
        if (!empty($filters['employee_id'])) {
            $query->forEmployee($filters['employee_id']);
        }

        // Filter by date range
        if (!empty($filters['start_date']) && !empty($filters['end_date'])) {
            $query->dateRange($filters['start_date'], $filters['end_date']);
        } elseif (!empty($filters['date'])) {
            $query->whereDate('date', $filters['date']);
        }

        // Filter by status
        if (!empty($filters['status'])) {
            $query->byStatus($filters['status']);
        }

        // Filter by department
        if (!empty($filters['department'])) {
            $query->whereHas('employee', function ($q) use ($filters) {
                $q->where('department', $filters['department']);
            });
        }

        return $query->orderBy('date', 'desc')
            ->orderBy('check_in', 'asc')
            ->get();
    }
}
