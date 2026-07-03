<?php

namespace App\Http\Controllers;

use App\Models\Position;
use Illuminate\Http\Request;

class PositionController extends Controller
{
    /**
     * GET /api/positions
     * Active positions, optionally filtered by department. Optionally augmented
     * with an employee count via ?with_counts=1 for the Settings UI.
     */
    public function index(Request $request)
    {
        $q = Position::query()->active()->orderBy('sort')->orderBy('name_en');

        if ($request->filled('department')) {
            $q->where('department_key', $request->department);
        }

        if ($request->boolean('with_counts')) {
            $q->withCount('employees');
        }

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($sub) use ($term) {
                $sub->where('name_en', 'like', "%{$term}%")
                    ->orWhere('name_ar', 'like', "%{$term}%");
            });
        }

        return response()->json($q->limit((int)$request->get('limit', 500))->get());
    }

    public function all()
    {
        return response()->json(
            Position::withCount('employees')->orderBy('sort')->orderBy('name_en')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name_en'        => 'required|string|max:150',
            'name_ar'        => 'nullable|string|max:150',
            'department_key' => 'nullable|string|max:50',
            'category'       => 'nullable|string|max:50',
            'level'          => 'nullable|string|max:30',
            'is_active'      => 'nullable|boolean',
            'sort'           => 'nullable|integer',
        ]);

        $data['sort']      = $data['sort']      ?? (Position::max('sort') + 1);
        $data['is_active'] = $data['is_active'] ?? true;

        return response()->json(Position::create($data), 201);
    }

    public function update(Request $request, Position $position)
    {
        $data = $request->validate([
            'name_en'        => 'sometimes|string|max:150',
            'name_ar'        => 'nullable|string|max:150',
            'department_key' => 'nullable|string|max:50',
            'category'       => 'nullable|string|max:50',
            'level'          => 'nullable|string|max:30',
            'is_active'      => 'sometimes|boolean',
            'sort'           => 'sometimes|integer',
        ]);

        $position->update($data);
        return response()->json($position);
    }

    public function destroy(Position $position)
    {
        // If any employee still references this position, refuse — keeps data integrity.
        if ($position->employees()->exists()) {
            return response()->json([
                'message' => 'Cannot delete: employees are still using this position. Deactivate it instead.'
            ], 422);
        }

        $position->delete();
        return response()->json(['message' => 'Deleted']);
    }

    /**
     * POST /api/positions/merge
     * Merge {from_id} → {to_id}: reassign all employees, then delete from.
     */
    public function merge(Request $request)
    {
        $data = $request->validate([
            'from_id' => 'required|exists:positions,id|different:to_id',
            'to_id'   => 'required|exists:positions,id',
        ]);

        \App\Models\Employee::where('position_id', $data['from_id'])
            ->update(['position_id' => $data['to_id']]);

        Position::where('id', $data['from_id'])->delete();

        return response()->json(['message' => 'Merged', 'to_id' => $data['to_id']]);
    }
}
