<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ManagerHierarchyService
{
    public static function wouldCreateCycle(int $employeeId, ?int $managerId): bool
    {
        $visited = [];
        $currentId = $managerId;

        while ($currentId && !in_array($currentId, $visited, true)) {
            if ($currentId === $employeeId) {
                return true;
            }
            $visited[] = $currentId;
            $currentId = (int) (Employee::query()
                ->whereKey($currentId)
                ->value('direct_manager_id') ?? 0);
        }

        return false;
    }

    /**
     * employees.direct_manager_id is the operational source of truth.
     * Keep the account-level manager links compatible with it.
     */
    public static function syncFromEmployee(Employee $employee): void
    {
        $managerUserId = self::nearestManagerUserId($employee);

        DB::table('employees')
            ->where('id', $employee->id)
            ->update(['user_manager_id' => $managerUserId]);

        if ($employee->user_id) {
            DB::table('users')
                ->where('id', $employee->user_id)
                ->update(['manager_id' => $managerUserId]);
        }
    }

    private static function nearestManagerUserId(Employee $employee): ?int
    {
        $managerId = $employee->direct_manager_id;
        $visited = [$employee->id];

        while ($managerId && !in_array((int) $managerId, $visited, true)) {
            $visited[] = (int) $managerId;
            $manager = Employee::query()
                ->select('id', 'user_id', 'direct_manager_id')
                ->find($managerId);

            if (!$manager) {
                return null;
            }
            if ($manager->user_id) {
                return (int) $manager->user_id;
            }

            $managerId = $manager->direct_manager_id;
        }

        return null;
    }

    public static function syncEmployeeIds(iterable $employeeIds): void
    {
        Employee::query()
            ->whereIn('id', collect($employeeIds)->filter()->unique()->values())
            ->each(fn (Employee $employee) => self::syncFromEmployee($employee));
    }

    /**
     * Apply an explicitly selected account manager to its linked employee.
     * If that manager account is not linked to Workforce yet, preserve the
     * existing employee hierarchy and only keep the account link.
     */
    public static function syncFromUser(User $user): void
    {
        $employee = Employee::active()->where('user_id', $user->id)->first();
        if (!$employee) {
            return;
        }

        if (!$user->manager_id) {
            $employee->update([
                'direct_manager_id' => null,
                'user_manager_id' => null,
                'manager_manual' => false,
            ]);
            return;
        }

        $managerEmployee = Employee::active()
            ->where('user_id', $user->manager_id)
            ->first();

        if (!$managerEmployee) {
            DB::table('employees')
                ->where('id', $employee->id)
                ->update(['user_manager_id' => $user->manager_id]);
            return;
        }

        if ($managerEmployee->id === $employee->id) {
            return;
        }

        $employee->update([
            'direct_manager_id' => $managerEmployee->id,
            'user_manager_id' => $managerEmployee->user_id,
            'manager_manual' => true,
        ]);
    }

    /**
     * Reconcile a newly linked user without overwriting an existing employee
     * manager. The Workforce hierarchy wins when both sides already exist.
     */
    public static function reconcileLinkedEmployee(User $user, Employee $employee): void
    {
        if ($employee->direct_manager_id) {
            self::syncFromEmployee($employee);
            return;
        }

        if ($user->manager_id) {
            self::syncFromUser($user);
            return;
        }

        if ($employee->user_manager_id && $employee->user_manager_id !== $user->id) {
            DB::table('users')
                ->where('id', $user->id)
                ->whereNull('manager_id')
                ->update(['manager_id' => $employee->user_manager_id]);
        }
    }
}
