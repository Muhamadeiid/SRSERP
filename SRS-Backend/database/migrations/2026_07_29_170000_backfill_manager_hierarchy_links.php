<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Fill missing links only. Existing values, including conflicts, are
        // deliberately preserved for review instead of being overwritten.
        $employees = DB::table('employees')
            ->select('id', 'user_id', 'direct_manager_id', 'user_manager_id')
            ->get();

        $byId = $employees->keyBy('id');
        $byUserId = $employees
            ->whereNotNull('user_id')
            ->groupBy('user_id');

        foreach ($employees as $employee) {
            $managerUserId = $employee->user_manager_id;

            if (!$managerUserId && $employee->direct_manager_id) {
                $manager = $byId->get($employee->direct_manager_id);
                $visited = [$employee->id];
                while ($manager && !$manager->user_id && !in_array($manager->id, $visited, true)) {
                    $visited[] = $manager->id;
                    $manager = $manager->direct_manager_id
                        ? $byId->get($manager->direct_manager_id)
                        : null;
                }
                $managerUserId = $manager?->user_id;
                if ($managerUserId) {
                    DB::table('employees')
                        ->where('id', $employee->id)
                        ->whereNull('user_manager_id')
                        ->update(['user_manager_id' => $managerUserId]);
                }
            }

            if (!$employee->direct_manager_id && $managerUserId) {
                $matches = $byUserId->get($managerUserId, collect());
                if ($matches->count() === 1 && $matches->first()->id !== $employee->id) {
                    DB::table('employees')
                        ->where('id', $employee->id)
                        ->whereNull('direct_manager_id')
                        ->update(['direct_manager_id' => $matches->first()->id]);
                }
            }

            if ($employee->user_id && $managerUserId && $employee->user_id !== $managerUserId) {
                DB::table('users')
                    ->where('id', $employee->user_id)
                    ->whereNull('manager_id')
                    ->update(['manager_id' => $managerUserId]);
            }
        }
    }

    public function down(): void
    {
        // Non-destructive data reconciliation cannot be reliably reversed.
    }
};
