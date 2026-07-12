<?php

namespace App\Http\Controllers;

use App\Models\FleetCheck;
use App\Models\FleetCheckItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FleetCheckController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = FleetCheck::with(['equipment:id,code,name,type,train_number', 'items'])
            ->latest();

        if ($request->filled('check_type'))
            $q->where('check_type', $request->check_type);
        if ($request->filled('status'))
            $q->where('status', $request->status);
        if ($request->filled('equipment_id'))
            $q->where('equipment_id', $request->equipment_id);
        if ($request->filled('search'))
            $q->where(function ($sq) use ($request) {
                $s = "%{$request->search}%";
                $sq->where('check_no', 'like', $s)
                   ->orWhere('inspector_name', 'like', $s)
                   ->orWhereHas('equipment', fn($e) => $e->where('code', 'like', $s)->orWhere('name', 'like', $s));
            });

        $perPage = $request->integer('per_page', 50);
        return response()->json($q->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'   => 'required|exists:equipment,id',
            'check_type'     => 'required|in:daily,weekly,monthly,quarterly,annual',
            'check_date'     => 'required|date',
            'inspector_id'   => 'nullable|exists:employees,id',
            'inspector_name' => 'nullable|string|max:255',
            'status'         => 'nullable|in:scheduled,in_progress,passed,failed,partial',
            'notes'          => 'nullable|string',
            'items'          => 'nullable|array',
            'items.*.item_name' => 'required_with:items|string|max:255',
            'items.*.result'    => 'nullable|in:pass,fail,na',
            'items.*.remarks'   => 'nullable|string',
        ]);

        $data['check_no']    = $this->generateCheckNo();
        $data['reported_by'] = auth()->id();

        $items = $data['items'] ?? [];
        unset($data['items']);

        $check = FleetCheck::create($data);

        if (!empty($items)) {
            $check->items()->createMany($items);
            $this->recountItems($check);
        }

        return response()->json($check->load(['equipment:id,code,name', 'items']), 201);
    }

    public function show(FleetCheck $fleetCheck): JsonResponse
    {
        return response()->json($fleetCheck->load(['equipment:id,code,name,type,train_number', 'items']));
    }

    public function update(Request $request, FleetCheck $fleetCheck): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'   => 'sometimes|exists:equipment,id',
            'check_type'     => 'sometimes|in:daily,weekly,monthly,quarterly,annual',
            'check_date'     => 'sometimes|date',
            'inspector_id'   => 'nullable|exists:employees,id',
            'inspector_name' => 'nullable|string|max:255',
            'status'         => 'nullable|in:scheduled,in_progress,passed,failed,partial',
            'notes'          => 'nullable|string',
            'items'          => 'nullable|array',
            'items.*.id'        => 'nullable|integer',
            'items.*.item_name' => 'required_with:items|string|max:255',
            'items.*.result'    => 'nullable|in:pass,fail,na',
            'items.*.remarks'   => 'nullable|string',
        ]);

        $items = $data['items'] ?? null;
        unset($data['items']);

        $fleetCheck->update($data);

        if ($items !== null) {
            $fleetCheck->items()->delete();
            $fleetCheck->items()->createMany($items);
            $this->recountItems($fleetCheck);
        }

        return response()->json($fleetCheck->load(['equipment:id,code,name', 'items']));
    }

    public function destroy(FleetCheck $fleetCheck): JsonResponse
    {
        $fleetCheck->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function stats(Request $request): JsonResponse
    {
        $q = FleetCheck::query();
        if ($request->filled('check_type'))
            $q->where('check_type', $request->check_type);

        return response()->json([
            'total'     => (clone $q)->count(),
            'scheduled' => (clone $q)->where('status', 'scheduled')->count(),
            'passed'    => (clone $q)->where('status', 'passed')->count(),
            'failed'    => (clone $q)->where('status', 'failed')->count(),
            'partial'   => (clone $q)->where('status', 'partial')->count(),
            'this_month'=> (clone $q)->whereMonth('check_date', now()->month)
                                     ->whereYear('check_date', now()->year)->count(),
        ]);
    }

    private function generateCheckNo(): string
    {
        $year = now()->format('y');
        $last = FleetCheck::withTrashed()
            ->where('check_no', 'like', "FC-{$year}-%")
            ->orderByRaw('CAST(SUBSTRING_INDEX(check_no, "-", -1) AS UNSIGNED) DESC')
            ->value('check_no');

        $next = $last ? (int) substr($last, strrpos($last, '-') + 1) + 1 : 1;
        return sprintf('FC-%s-%04d', $year, $next);
    }

    private function recountItems(FleetCheck $check): void
    {
        $check->update([
            'total_items'  => $check->items()->count(),
            'passed_items' => $check->items()->where('result', 'pass')->count(),
            'failed_items' => $check->items()->where('result', 'fail')->count(),
        ]);
    }
}
