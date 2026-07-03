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
            'from_id'         => 'required|integer',
            'to_id'           => 'nullable|integer',
            'employee_ids'    => 'nullable|array',
            'employee_ids.*'  => 'integer|exists:employees,id',
        ]);

        return DB::transaction(function () use ($data) {
            $affected = 0;

            if (in_array($data['mode'], ['direct', 'both'])) {
                $q = Employee::where('direct_manager_id', $data['from_id']);
                if (!empty($data['employee_ids'])) $q->whereIn('id', $data['employee_ids']);
                $affected += $q->update(['direct_manager_id' => $data['to_id']]);
            }

            if (in_array($data['mode'], ['user', 'both'])) {
                $q = Employee::where('user_manager_id', $data['from_id']);
                if (!empty($data['employee_ids'])) $q->whereIn('id', $data['employee_ids']);
                $affected += $q->update(['user_manager_id' => $data['to_id']]);
            }

            return response()->json(['ok' => true, 'affected' => $affected]);
        });
    }
}
