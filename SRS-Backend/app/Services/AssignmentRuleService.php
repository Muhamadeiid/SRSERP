<?php

namespace App\Services;

use App\Models\AssignmentRule;
use App\Models\Employee;

class AssignmentRuleService
{
    private static function exactPositionMatch(AssignmentRule $rule, Employee $emp): bool
    {
        return $rule->match_field === 'position'
            && strcasecmp(trim((string) $emp->position), trim((string) $rule->match_value)) === 0;
    }

    private static function normalizeDepartment(?string $department): ?string
    {
        $key = strtolower(trim((string) $department));
        if ($key === '') return null;

        return [
            'intervention' => 'cm_intervention',
            'heavy_maintenance' => 'hm',
            'workshop' => 'admin',
        ][$key] ?? $key;
    }

    private static function departmentFromPosition(Employee $emp): ?string
    {
        $position = $emp->relationLoaded('positionRef')
            ? $emp->positionRef
            : $emp->positionRef()->first();

        return self::normalizeDepartment($position?->department_key) ?? self::normalizeDepartment(Employee::inferDepartment($emp->position));
    }

    /**
     * Apply the first matching rule to a single employee.
     * Manual manager picks are preserved, but department/location can still be
     * normalized by the rule. Returns true if any employee field changed.
     */
    public static function applyToEmployee(Employee $emp, ?array $rules = null): bool
    {
        $rules ??= AssignmentRule::where('is_active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get()
            ->all();

        $matchingRules = array_values(array_filter($rules, fn ($rule) => $rule->matches($emp)));
        usort($matchingRules, function ($a, $b) use ($emp) {
            $exact = (int) self::exactPositionMatch($b, $emp) <=> (int) self::exactPositionMatch($a, $emp);
            if ($exact !== 0) return $exact;

            $priority = ((int) $a->priority) <=> ((int) $b->priority);
            if ($priority !== 0) return $priority;

            $length = strlen((string) $b->match_value) <=> strlen((string) $a->match_value);
            if ($length !== 0) return $length;

            return ((int) $a->id) <=> ((int) $b->id);
        });

        $rule = $matchingRules[0] ?? null;
        $dirty = false;

        $positionDepartment = self::departmentFromPosition($emp);
        if ($positionDepartment && $emp->department !== $positionDepartment) {
            $emp->department = $positionDepartment;
            $dirty = true;
        }

        if ($rule) {
            if (!$emp->manager_manual && $rule->direct_manager_id && (int) $emp->direct_manager_id !== (int) $rule->direct_manager_id) {
                $emp->direct_manager_id = $rule->direct_manager_id;
                $dirty = true;
            }
            $ruleDepartment = self::normalizeDepartment($rule->department);
            if ($ruleDepartment && $emp->department !== $ruleDepartment) {
                $emp->department = $ruleDepartment;
                $dirty = true;
            }
            if ($rule->work_location && $emp->work_location !== $rule->work_location) {
                $emp->work_location = $rule->work_location;
                $dirty = true;
            }
        }

        if ($dirty) {
            $emp->save();
            return true;
        }

        return false;
    }

    /**
     * Re-apply every active rule across the whole workforce. Returns the number
     * of employees whose assignment fields changed.
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
        Employee::chunkById(200, function ($employees) use ($rules, &$changed) {
            foreach ($employees as $emp) {
                if (self::applyToEmployee($emp, $rules)) $changed++;
            }
        });

        return $changed;
    }
}
