<?php

namespace App\Http\Controllers;

use App\Models\Equipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EquipmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Equipment::withCount(['jobCards', 'jobCards as open_jobs_count' => function ($q) {
            $q->whereIn('status', ['open', 'in_progress']);
        }])->latest();

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('code', 'like', "%{$term}%")
                      ->orWhere('name', 'like', "%{$term}%")
                      ->orWhere('type', 'like', "%{$term}%")
                      ->orWhere('fleet', 'like', "%{$term}%")
                      ->orWhere('location', 'like', "%{$term}%");
            });
        }

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }

        if ($request->filled('location')) {
            $q->where('location', $request->location);
        }

        return response()->json(['success' => true, 'data' => $q->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'     => 'required|string|max:50|unique:equipment,code',
            'name'     => 'required|string|max:255',
            'type'     => 'nullable|string|max:50',
            'fleet'    => 'nullable|string|max:50',
            'location' => 'nullable|string|max:100',
            'status'   => 'nullable|in:available,under_maintenance,out_of_service',
            'notes'    => 'nullable|string',
        ]);

        $eq = Equipment::create($data);
        return response()->json(['success' => true, 'data' => $eq], 201);
    }

    public function show(Equipment $equipment): JsonResponse
    {
        $equipment->loadCount(['jobCards', 'jobCards as open_jobs_count' => function ($q) {
            $q->whereIn('status', ['open', 'in_progress']);
        }]);
        $equipment->load(['jobCards' => function ($q) {
            $q->latest()->limit(20);
        }]);

        return response()->json(['success' => true, 'data' => $equipment]);
    }

    public function update(Request $request, Equipment $equipment): JsonResponse
    {
        $data = $request->validate([
            'code'     => 'sometimes|string|max:50|unique:equipment,code,' . $equipment->id,
            'name'     => 'sometimes|string|max:255',
            'type'     => 'nullable|string|max:50',
            'fleet'    => 'nullable|string|max:50',
            'location' => 'nullable|string|max:100',
            'status'   => 'nullable|in:available,under_maintenance,out_of_service',
            'notes'    => 'nullable|string',
        ]);

        $equipment->update($data);
        return response()->json(['success' => true, 'data' => $equipment]);
    }

    public function destroy(Equipment $equipment): JsonResponse
    {
        $equipment->delete();
        return response()->json(['success' => true]);
    }

    public function stats(): JsonResponse
    {
        $total = Equipment::count();
        $available = Equipment::where('status', 'available')->count();
        $underMaint = Equipment::where('status', 'under_maintenance')->count();
        $oos = Equipment::where('status', 'out_of_service')->count();
        $locations = Equipment::whereNotNull('location')
            ->selectRaw('location, COUNT(*) as count')
            ->groupBy('location')
            ->pluck('count', 'location');

        return response()->json([
            'success' => true,
            'data' => compact('total', 'available', 'underMaint', 'oos', 'locations'),
        ]);
    }
}
