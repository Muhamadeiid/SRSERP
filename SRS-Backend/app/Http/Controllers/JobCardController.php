<?php

namespace App\Http\Controllers;

use App\Models\JobCard;
use App\Models\Equipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobCardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = JobCard::with(['equipment:id,code,name,location', 'assignee:id,name,position,department'])
            ->latest();

        if ($request->filled('maintenance_type')) {
            $q->where('maintenance_type', $request->maintenance_type);
        }

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }

        if ($request->filled('priority')) {
            $q->where('priority', $request->priority);
        }

        if ($request->filled('equipment_id')) {
            $q->where('equipment_id', $request->equipment_id);
        }

        if ($request->filled('assigned_to')) {
            $q->where('assigned_to', $request->assigned_to);
        }

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('card_no', 'like', "%{$term}%")
                      ->orWhere('title', 'like', "%{$term}%")
                      ->orWhere('assigned_to_name', 'like', "%{$term}%")
                      ->orWhereHas('equipment', function ($eq) use ($term) {
                          $eq->where('code', 'like', "%{$term}%")
                             ->orWhere('name', 'like', "%{$term}%");
                      });
            });
        }

        $perPage = (int) $request->get('per_page', 50);
        $result = $q->paginate($perPage);

        return response()->json([
            'success'    => true,
            'data'       => $result->items(),
            'pagination' => [
                'total'        => $result->total(),
                'per_page'     => $result->perPage(),
                'current_page' => $result->currentPage(),
                'last_page'    => $result->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'maintenance_type' => 'required|in:cm,pm,hm',
            'equipment_id'     => 'required|exists:equipment,id',
            'title'            => 'required|string|max:255',
            'description'      => 'nullable|string',
            'priority'         => 'nullable|in:low,medium,high,critical',
            'status'           => 'nullable|in:open,in_progress,completed,closed',
            'assigned_to'      => 'nullable|exists:employees,id',
            'assigned_to_name' => 'nullable|string|max:255',
            'reported_date'    => 'nullable|date',
            'started_at'       => 'nullable|date',
            'completed_at'     => 'nullable|date',
            'downtime_hours'   => 'nullable|numeric|min:0',
            'scheduled_date'   => 'nullable|date',
            'frequency'        => 'nullable|string|max:50',
            'work_performed'   => 'nullable|string',
            'parts_used'       => 'nullable|string',
            'root_cause'       => 'nullable|string',
            'notes'            => 'nullable|string',
        ]);

        $data['card_no'] = $this->generateCardNo($data['maintenance_type']);
        $data['reported_by'] = $request->user()?->id;
        $data['reported_date'] = $data['reported_date'] ?? now()->toDateString();

        $card = JobCard::create($data);
        $card->load(['equipment:id,code,name,location', 'assignee:id,name,position,department']);

        if (in_array($data['status'] ?? 'open', ['in_progress', 'open'])) {
            Equipment::where('id', $data['equipment_id'])->update(['status' => 'under_maintenance']);
        }

        return response()->json(['success' => true, 'data' => $card], 201);
    }

    public function show(JobCard $jobCard): JsonResponse
    {
        $jobCard->load(['equipment', 'assignee:id,name,position,department', 'reporter:id,name']);
        return response()->json(['success' => true, 'data' => $jobCard]);
    }

    public function update(Request $request, JobCard $jobCard): JsonResponse
    {
        $data = $request->validate([
            'title'            => 'sometimes|string|max:255',
            'description'      => 'nullable|string',
            'priority'         => 'nullable|in:low,medium,high,critical',
            'status'           => 'nullable|in:open,in_progress,completed,closed',
            'assigned_to'      => 'nullable|exists:employees,id',
            'assigned_to_name' => 'nullable|string|max:255',
            'started_at'       => 'nullable|date',
            'completed_at'     => 'nullable|date',
            'downtime_hours'   => 'nullable|numeric|min:0',
            'scheduled_date'   => 'nullable|date',
            'frequency'        => 'nullable|string|max:50',
            'work_performed'   => 'nullable|string',
            'parts_used'       => 'nullable|string',
            'root_cause'       => 'nullable|string',
            'notes'            => 'nullable|string',
        ]);

        if (isset($data['status']) && $data['status'] === 'completed' && !isset($data['completed_at'])) {
            $data['completed_at'] = now();
        }

        $jobCard->update($data);

        if (isset($data['status']) && in_array($data['status'], ['completed', 'closed'])) {
            $openOnSameEquipment = JobCard::where('equipment_id', $jobCard->equipment_id)
                ->whereIn('status', ['open', 'in_progress'])
                ->where('id', '!=', $jobCard->id)
                ->exists();
            if (!$openOnSameEquipment) {
                Equipment::where('id', $jobCard->equipment_id)->update(['status' => 'available']);
            }
        }

        $jobCard->load(['equipment:id,code,name,location', 'assignee:id,name,position,department']);
        return response()->json(['success' => true, 'data' => $jobCard]);
    }

    public function destroy(JobCard $jobCard): JsonResponse
    {
        $jobCard->delete();
        return response()->json(['success' => true]);
    }

    public function stats(Request $request): JsonResponse
    {
        $type = $request->maintenance_type;
        $q = JobCard::query();
        if ($type) $q->where('maintenance_type', $type);

        $total     = (clone $q)->count();
        $open      = (clone $q)->where('status', 'open')->count();
        $inProgress = (clone $q)->where('status', 'in_progress')->count();
        $completed = (clone $q)->where('status', 'completed')->count();
        $closed    = (clone $q)->where('status', 'closed')->count();
        $critical  = (clone $q)->where('priority', 'critical')->whereIn('status', ['open', 'in_progress'])->count();

        $avgDowntime = (clone $q)->whereNotNull('downtime_hours')
            ->where('status', 'completed')
            ->avg('downtime_hours');

        $thisMonth = (clone $q)->where('status', 'completed')
            ->whereMonth('completed_at', now()->month)
            ->whereYear('completed_at', now()->year)
            ->count();

        return response()->json([
            'success' => true,
            'data' => [
                'total' => $total,
                'open' => $open,
                'in_progress' => $inProgress,
                'completed' => $completed,
                'closed' => $closed,
                'critical' => $critical,
                'avg_downtime_hours' => round($avgDowntime ?? 0, 1),
                'completed_this_month' => $thisMonth,
            ],
        ]);
    }

    private function generateCardNo(string $type): string
    {
        $prefix = strtoupper($type);
        $year = date('y');
        $last = JobCard::where('card_no', 'like', "{$prefix}-{$year}-%")
            ->orderByDesc('card_no')
            ->value('card_no');

        $seq = 1;
        if ($last && preg_match('/-(\d+)$/', $last, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return "{$prefix}-{$year}-" . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}
