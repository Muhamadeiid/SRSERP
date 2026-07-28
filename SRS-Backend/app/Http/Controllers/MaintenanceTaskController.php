<?php

namespace App\Http\Controllers;

use App\Models\Equipment;
use App\Models\MaintenanceTask;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceTaskController extends Controller
{
    private const DEPARTMENTS = ['cm', 'pm', 'hm'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canViewTasks($user), 403);
        $query = MaintenanceTask::with([
            'assignee:id,name,department',
            'creator:id,name',
            'equipment:id,code,name,type,car_type,train_number,unit_index,parent_id',
            'equipment.parent:id,code,name,train_number',
        ])->latest();

        if (!$this->canManageAll($user)) {
            $query->where(function ($q) use ($user) {
                $q->where('target_department', $user->department)
                    ->orWhere('assigned_user_id', $user->id);
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'success' => true,
            'data' => $query->limit(100)->get(),
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless($this->canManageAll($request->user()), 403);

        $managers = User::where('is_active', true)
            ->where(function ($q) {
                $q->where('role', 'manager')->orWhere('is_team_manager', true);
            })
            ->whereIn('department', self::DEPARTMENTS)
            ->orderBy('name')
            ->get(['id', 'name', 'department']);

        $equipment = Equipment::where(function ($q) {
                $q->where('type', 'train')->orWhereNotNull('parent_id');
            })
            ->orderBy('train_number')
            ->orderBy('unit_index')
            ->get(['id', 'code', 'name', 'type', 'car_type', 'train_number', 'unit_index', 'parent_id']);

        return response()->json([
            'success' => true,
            'data' => compact('managers', 'equipment'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($this->canManageAll($request->user()), 403);

        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'target_department' => 'required|in:cm,pm,hm',
            'assigned_user_id' => 'nullable|exists:users,id',
            'equipment_id' => 'nullable|exists:equipment,id',
            'priority' => 'required|in:low,medium,high,critical',
            'due_date' => 'nullable|date',
        ]);

        if (!empty($data['assigned_user_id'])) {
            $validAssignee = User::whereKey($data['assigned_user_id'])
                ->where('department', $data['target_department'])
                ->exists();
            abort_unless($validAssignee, 422, 'The selected manager does not belong to the target department.');
        }

        $data['created_by'] = $request->user()->id;
        $task = MaintenanceTask::create($data);

        return response()->json([
            'success' => true,
            'data' => $task->load(['assignee:id,name,department', 'creator:id,name', 'equipment.parent']),
        ], 201);
    }

    public function update(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canViewTasks($user), 403);
        $canUpdate = $this->canManageAll($user)
            || $maintenanceTask->target_department === $user->department
            || $maintenanceTask->assigned_user_id === $user->id;
        abort_unless($canUpdate, 403);

        $rules = $this->canManageAll($user)
            ? [
                'title' => 'sometimes|string|max:255',
                'description' => 'nullable|string|max:2000',
                'target_department' => 'sometimes|in:cm,pm,hm',
                'assigned_user_id' => 'nullable|exists:users,id',
                'equipment_id' => 'nullable|exists:equipment,id',
                'priority' => 'sometimes|in:low,medium,high,critical',
                'due_date' => 'nullable|date',
                'status' => 'sometimes|in:pending,in_progress,done',
            ]
            : ['status' => 'required|in:pending,in_progress,done'];

        $data = $request->validate($rules);
        if (isset($data['status'])) {
            $data['completed_at'] = $data['status'] === 'done' ? now() : null;
        }
        $maintenanceTask->update($data);

        return response()->json([
            'success' => true,
            'data' => $maintenanceTask->load(['assignee:id,name,department', 'creator:id,name', 'equipment.parent']),
        ]);
    }

    public function destroy(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        abort_unless($this->canManageAll($request->user()), 403);
        $maintenanceTask->delete();
        return response()->json(['success' => true]);
    }

    private function canManageAll(User $user): bool
    {
        return in_array($user->role, ['admin', 'depot_manager'], true);
    }

    private function canViewTasks(User $user): bool
    {
        return $this->canManageAll($user) || $user->role === 'manager';
    }
}
