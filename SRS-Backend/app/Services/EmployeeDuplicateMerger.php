<?php

namespace App\Services;

use App\Models\Employee;
use DomainException;
use Illuminate\Support\Facades\DB;

class EmployeeDuplicateMerger
{
    public function mergeInto(Employee $canonical, Employee $duplicate): void
    {
        if ($canonical->is($duplicate)) {
            return;
        }

        DB::transaction(function () use ($canonical, $duplicate) {
            $this->assertCanMerge($canonical, $duplicate);
            $this->mergeLeaveBalance($canonical, $duplicate);

            foreach ([
                'leave_requests',
                'employee_assets',
                'disciplinary_cases',
                'clearance_reports',
            ] as $table) {
                DB::table($table)
                    ->where('employee_id', $duplicate->id)
                    ->update(['employee_id' => $canonical->id]);
            }

            DB::table('attendances')
                ->where('employee_id', $duplicate->id)
                ->update(['employee_id' => $canonical->id]);

            DB::table('employees')
                ->where('direct_manager_id', $duplicate->id)
                ->update(['direct_manager_id' => $canonical->id]);

            DB::table('assignment_rules')
                ->where('direct_manager_id', $duplicate->id)
                ->update(['direct_manager_id' => $canonical->id]);

            $this->preserveProfileData($canonical, $duplicate);
            $duplicate->delete();
        });
    }

    public function assertCanMerge(Employee $canonical, Employee $duplicate): void
    {
        $this->assertAttendanceCanMerge($canonical, $duplicate);
        $this->assertLeaveBalanceCanMerge($canonical, $duplicate);
    }

    private function assertAttendanceCanMerge(Employee $canonical, Employee $duplicate): void
    {
        $overlap = DB::table('attendances as old')
            ->join('attendances as current', function ($join) use ($canonical) {
                $join->on('current.date', '=', 'old.date')
                    ->where('current.employee_id', '=', $canonical->id);
            })
            ->where('old.employee_id', $duplicate->id)
            ->exists();

        if ($overlap) {
            throw new DomainException(
                "Duplicate employee {$duplicate->name} has overlapping attendance records; review it manually."
            );
        }
    }

    private function mergeLeaveBalance(Employee $canonical, Employee $duplicate): void
    {
        $current = DB::table('leave_balances')->where('employee_id', $canonical->id)->first();
        $old = DB::table('leave_balances')->where('employee_id', $duplicate->id)->first();

        if (!$old) {
            return;
        }

        if (!$current) {
            DB::table('leave_balances')
                ->where('employee_id', $duplicate->id)
                ->update(['employee_id' => $canonical->id]);
            return;
        }

        DB::table('leave_balances')->where('id', $old->id)->delete();
    }

    private function assertLeaveBalanceCanMerge(Employee $canonical, Employee $duplicate): void
    {
        $current = DB::table('leave_balances')->where('employee_id', $canonical->id)->first();
        $old = DB::table('leave_balances')->where('employee_id', $duplicate->id)->first();
        if (!$current || !$old) {
            return;
        }

        foreach (['annual', 'casual', 'sick', 'early'] as $field) {
            if ((string) $current->{$field} !== (string) $old->{$field}) {
                throw new DomainException(
                    "Duplicate employee {$duplicate->name} has conflicting leave balances; review it manually."
                );
            }
        }
    }

    private function preserveProfileData(Employee $canonical, Employee $duplicate): void
    {
        $protected = [
            'e_signature',
            'direct_manager_id',
            'user_id',
            'user_manager_id',
            'saturday_group',
            'weekly_off_day',
        ];
        $updates = [];

        foreach ($protected as $field) {
            if (blank($canonical->{$field}) && filled($duplicate->{$field})) {
                $updates[$field] = $duplicate->{$field};
            }
        }

        if ($updates) {
            $canonical->forceFill($updates)->save();
        }
    }
}
