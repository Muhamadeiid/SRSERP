<?php

namespace App\Services;

use App\Models\AssignmentRule;
use App\Models\Employee;

class AssignmentRuleService
{
    /**
     * Apply the first matching rule to a single employee.
     * Skips employees whose manager was set manually. Returns true if the
     * employee's direct_manager_id changed.
     */
    public static function applyToEmployee(Employee $emp, ?array $rules = null): bool
    {
        if ($emp->manager_manual) return false;

        $rules ??= AssignmentRule::where('is_active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get()
            ->all();

        foreach ($rules as $rule) {
            if ($rule->matches($emp)) {
                if ((int) $emp->direct_manager_id !== (int) $rule->direct_manager_id) {
                    $emp->direct_manager_id = $rule->direct_manager_id;
                    $emp->save();
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    /**
     * Re-apply every active rule across the whole workforce (respecting manual
     * overrides). Returns the number of employees whose manager changed.
     */
    public static function applyAll(): int
    {
        $rules = AssignmentRule::where('is_active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get()
            ->all();

        if (empty($rules)) return 0;

        $changed = 0;
        Employee::where('manager_manual', false)
            ->orWhereNull('manager_manual')
            ->chunkById(200, function ($employees) use ($rules, &$changed) {
                foreach ($employees as $emp) {
                    if (self::applyToEmployee($emp, $rules)) $changed++;
                }
            });

        return $changed;
    }
}
