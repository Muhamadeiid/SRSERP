<?php

namespace App\Http\Controllers;

use App\Models\Equipment;
use App\Models\MaintenanceTask;
use App\Models\MaintenanceTaskActivity;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceTaskController extends Controller
{
    private const DEPARTMENTS = ['cm', 'pm', 'hm'];
    private const UNIT_CARS = [
        1 => ['MC1', 'T', 'M1'],
        2 => ['M2', 'T', 'M1'],
        3 => ['M1', 'T', 'MC2'],
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canViewTasks($user), 403);
        $query = MaintenanceTask::with([
            'assignee:id,name,department',
            'creator:id,name',
            'viewers',
            'equipment:id,code,name,type,car_type,train_number,unit_index,parent_id',
            'equipment.parent:id,code,name,train_number',
        ])->latest();

        if (!$this->canManageAll($user)) {
            $query->whereHas('viewers', fn ($q) => $q->where('users.id', $user->id));
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

        return response()->json([
            'success' => true,
            'data' => ['managers' => $managers],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($this->canManageAll($request->user()), 403);

        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'viewer_user_ids' => 'present|array',
            'viewer_user_ids.*' => 'integer|distinct|exists:users,id',
            'train_number' => 'nullable|integer|between:1,20|required_with:unit_number,car_code',
            'unit_number' => 'nullable|integer|between:1,3|required_with:car_code',
            'car_code' => 'nullable|string|in:MC1,MC2,M1,M2,T',
            'priority' => 'required|in:low,medium,high,critical',
            'due_date' => 'nullable|date',
        ]);

        $viewerIds = $data['viewer_user_ids'];
        unset($data['viewer_user_ids']);
        if (!empty($data['car_code']) && !in_array($data['car_code'], self::UNIT_CARS[$data['unit_number']] ?? [], true)) {
            abort(422, 'The selected car does not belong to this unit.');
        }
        $validViewerCount = User::whereIn('id', $viewerIds)
            ->where(function ($q) {
                $q->where('role', 'manager')->orWhere('is_team_manager', true);
            })
            ->count();
        abort_unless($validViewerCount === count($viewerIds), 422, 'One or more selected viewers are not maintenance managers.');
        $data['target_department'] = !empty($viewerIds)
            ? (User::whereKey($viewerIds[0])->value('department') ?? 'cm')
            : 'cm';
        $data['status'] = 'pending';
        $data['created_by'] = $request->user()->id;
        $task = MaintenanceTask::create($data);
        $task->viewers()->sync($viewerIds);
        $task->refresh();

        $position = $this->trainPosition($task);
        foreach ($viewerIds as $viewerId) {
            // Task assignees must act on this — push so they see it away from the app.
            Notification::notifyUser(
                $viewerId,
                'maintenance_task_assigned',
                'New maintenance task',
                $task->title . ($position ? " - {$position}" : ''),
                ['maintenance_task_id' => $task->id, 'path' => '/maintenance'],
                true
            );
        }

        return response()->json([
            'success' => true,
            'data' => $task->load(['viewers', 'creator:id,name']),
        ], 201);
    }

    public function update(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canViewTasks($user), 403);
        abort_unless($this->canAccessTask($user, $maintenanceTask), 403);

        $rules = $this->canManageAll($user)
            ? [
                'title' => 'sometimes|string|max:255',
                'description' => 'nullable|string|max:2000',
                'target_department' => 'sometimes|in:cm,pm,hm',
                'viewer_user_ids' => 'sometimes|array',
                'viewer_user_ids.*' => 'integer|distinct|exists:users,id',
                'train_number' => 'nullable|integer|between:1,20',
                'unit_number' => 'nullable|integer|between:1,3',
                'car_code' => 'nullable|string|in:MC1,MC2,M1,M2,T',
                'priority' => 'sometimes|in:low,medium,high,critical',
                'due_date' => 'nullable|date',
                'status' => 'sometimes|in:pending,in_progress,done',
            ]
            : ['status' => 'required|in:pending,in_progress,done'];

        $data = $request->validate($rules);
        $oldStatus = $maintenanceTask->status;
        $viewerIds = $data['viewer_user_ids'] ?? null;
        unset($data['viewer_user_ids']);
        if (isset($data['status'])) {
            $data['completed_at'] = $data['status'] === 'done' ? now() : null;
        }
        $maintenanceTask->update($data);
        if (isset($data['status']) && $data['status'] !== $oldStatus) {
            MaintenanceTaskActivity::create([
                'maintenance_task_id' => $maintenanceTask->id,
                'user_id' => $user->id,
                'type' => 'status_change',
                'from_status' => $oldStatus,
                'to_status' => $data['status'],
            ]);
            $this->notifyTaskParticipants($maintenanceTask, $user->id, 'Task status updated', "{$user->name} changed {$maintenanceTask->title} to " . str_replace('_', ' ', $data['status']));
        }
        if ($viewerIds !== null) {
            $maintenanceTask->viewers()->sync($viewerIds);
        }

        return response()->json([
            'success' => true,
            'data' => $maintenanceTask->load(['viewers', 'creator:id,name']),
        ]);
    }

    public function destroy(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        abort_unless($this->canManageAll($request->user()), 403);
        $maintenanceTask->delete();
        return response()->json(['success' => true]);
    }

    public function activities(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        abort_unless($this->canAccessTask($request->user(), $maintenanceTask), 403);

        return response()->json([
            'success' => true,
            'data' => $maintenanceTask->activities()->with('user:id,name')->get(),
        ]);
    }

    public function addActivity(Request $request, MaintenanceTask $maintenanceTask): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canAccessTask($user, $maintenanceTask), 403);

        $data = $request->validate([
            'body' => 'required|string|max:3000',
            'status' => 'nullable|in:pending,in_progress,done',
        ]);

        $activity = MaintenanceTaskActivity::create([
            'maintenance_task_id' => $maintenanceTask->id,
            'user_id' => $user->id,
            'type' => 'comment',
            'body' => $data['body'],
        ]);

        if (!empty($data['status']) && $data['status'] !== $maintenanceTask->status) {
            $oldStatus = $maintenanceTask->status;
            $maintenanceTask->update([
                'status' => $data['status'],
                'completed_at' => $data['status'] === 'done' ? now() : null,
            ]);
            MaintenanceTaskActivity::create([
                'maintenance_task_id' => $maintenanceTask->id,
                'user_id' => $user->id,
                'type' => 'status_change',
                'from_status' => $oldStatus,
                'to_status' => $data['status'],
            ]);
        }

        $this->notifyTaskParticipants(
            $maintenanceTask,
            $user->id,
            'Maintenance task update',
            "{$user->name} added an update to {$maintenanceTask->title}"
        );

        return response()->json([
            'success' => true,
            'data' => $activity->load('user:id,name'),
            'task' => $maintenanceTask->fresh()->load(['viewers', 'creator:id,name']),
            'activities' => $maintenanceTask->activities()->with('user:id,name')->get(),
        ], 201);
    }

    private function canManageAll(User $user): bool
    {
        return in_array($user->role, ['admin', 'depot_manager'], true);
    }

    private function canViewTasks(User $user): bool
    {
        return $this->canManageAll($user) || $user->role === 'manager' || $user->is_team_manager;
    }

    private function canAccessTask(User $user, MaintenanceTask $task): bool
    {
        return $this->canManageAll($user)
            || (($user->role === 'manager' || $user->is_team_manager)
                && $task->viewers()->where('users.id', $user->id)->exists());
    }

    private function notifyTaskParticipants(MaintenanceTask $task, int $actorId, string $title, string $body): void
    {
        $recipientIds = $task->viewers()->pluck('users.id')->push($task->created_by)
            ->filter()
            ->unique()
            ->reject(fn ($id) => (int) $id === $actorId);

        foreach ($recipientIds as $recipientId) {
            Notification::notifyUser(
                (int) $recipientId,
                'maintenance_task_updated',
                $title,
                $body,
                ['maintenance_task_id' => $task->id, 'path' => '/maintenance']
            );
        }
    }

    private function trainPosition(MaintenanceTask $task): string
    {
        if (!$task->train_number) return '';

        $label = 'TS' . str_pad((string) $task->train_number, 2, '0', STR_PAD_LEFT);
        if ($task->unit_number) {
            $unitCode = 1000 + $task->train_number + (($task->unit_number - 1) * 20);
            $label .= " / Unit {$task->unit_number} ({$unitCode})";
        }
        if ($task->car_code) {
            $label .= " / {$task->car_code}";
        }
        return $label;
    }
}
