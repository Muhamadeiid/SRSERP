<?php

namespace App\Http\Controllers;

use App\Models\AssignmentRule;
use App\Services\AssignmentRuleService;
use Illuminate\Http\Request;

class AssignmentRuleController extends Controller
{
    public function index()
    {
        return response()->json(
            AssignmentRule::with('manager:id,name,position')
                ->orderBy('priority')->orderBy('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'match_field'       => 'required|in:department,position',
            'match_value'       => 'required|string|max:150',
            'direct_manager_id' => 'required|exists:employees,id',
            'is_active'         => 'nullable|boolean',
            'priority'          => 'nullable|integer',
        ]);

        $data['is_active'] = $data['is_active'] ?? true;
        $data['priority']  = $data['priority']  ?? (AssignmentRule::max('priority') + 1);

        $rule = AssignmentRule::create($data);
        return response()->json($rule->load('manager:id,name,position'), 201);
    }

    public function update(Request $request, AssignmentRule $assignmentRule)
    {
        $data = $request->validate([
            'match_field'       => 'sometimes|in:department,position',
            'match_value'       => 'sometimes|string|max:150',
            'direct_manager_id' => 'sometimes|exists:employees,id',
            'is_active'         => 'sometimes|boolean',
            'priority'          => 'sometimes|integer',
        ]);

        $assignmentRule->update($data);
        return response()->json($assignmentRule->load('manager:id,name,position'));
    }

    public function destroy(AssignmentRule $assignmentRule)
    {
        $assignmentRule->delete();
        return response()->json(['message' => 'Deleted']);
    }

    /**
     * POST /api/assignment-rules/apply
     * Re-runs every active rule across the workforce.
     */
    public function apply()
    {
        $changed = AssignmentRuleService::applyAll();
        return response()->json(['ok' => true, 'changed' => $changed]);
    }
}
