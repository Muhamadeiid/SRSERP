<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TeamTransferController extends Controller
{
    /**
     * POST /api/team-transfer
     *
     * Bulk-reassign employees when someone gets promoted, leaves, or a team
     * moves under a new manager. One click instead of editing each employee.
     *
     * Body: {
     *   mode: 'direct'|'user'|'both'   – which manager column to change
     *   from_id: int                    – employees.id (for direct) or users.id (for user)
     *   to_id: int|null                 – null to un-assign
     *   employee_ids?: int[]            – if provided, only these; otherwise all under from_id
     * }
     */
    public function transfer(Request $request)
    {
        $data = $request->validate([
            'mode'            => 'required|in:direct,user,both',
            'from_id'         => 'required|integer|exists:employees,id',
            'to_id'           => 'nullable|integer|exists:employees,id|different:from_id',
            'employee_ids'    => 'nullable|array',
            'employee_ids.*'  => 'integer|exists:employees,id',
        ]);

        return DB::transaction(function () use ($data) {
            $fromManager = Employee::active()->findOrFail($data['from_id']);
            $toManager = !empty($data['to_id'])
                ? Employee::active()->findOrFail($data['to_id'])
                : null;
            $affectedIds = collect();

            $q = Employee::active()->where('direct_manager_id', $fromManager->id);
            if (!empty($data['employee_ids'])) $q->whereIn('id', $data['employee_ids']);
            $ids = (clone $q)->pluck('id');
            if ($toManager) {
                foreach ($ids as $employeeId) {
                    if (\App\Services\ManagerHierarchyService::wouldCreateCycle((int) $employeeId, $toManager->id)) {
                        return response()->json([
                            'message' => 'This transfer would create a loop in the organization chart.',
                        ], 422);
                    }
                }
            }
            $q->update([
                'direct_manager_id' => $toManager?->id,
                'manager_manual' => (bool) $toManager,
            ]);
            $affectedIds = $affectedIds->merge($ids);
            \App\Services\ManagerHierarchyService::syncEmployeeIds($affectedIds);

            return response()->json(['ok' => true, 'affected' => $affectedIds->unique()->count()]);
        });
    }
}
