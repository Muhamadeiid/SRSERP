<?php

namespace App\Http\Controllers;

use App\Models\Lookup;
use Illuminate\Http\Request;

class LookupController extends Controller
{
    /**
     * GET /api/lookups?type=department
     * Returns active items of a given type, ordered by sort.
     * Without ?type, returns everything grouped by type — used by the frontend
     * on app load to populate all dropdowns in one round-trip.
     */
    public function index(Request $request)
    {
        $q = Lookup::query()->active()->orderBy('type')->orderBy('sort');

        if ($request->filled('type')) {
            return response()->json($q->ofType($request->type)->get());
        }

        return response()->json($q->get()->groupBy('type'));
    }

    /**
     * GET /api/lookups/all — admin view (includes inactive rows) for the Settings UI.
     */
    public function all()
    {
        return response()->json(
            Lookup::orderBy('type')->orderBy('sort')->get()->groupBy('type')
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'type'      => 'required|string|max:50',
            'key'       => 'required|string|max:50',
            'label_en'  => 'required|string|max:100',
            'label_ar'  => 'nullable|string|max:100',
            'color'     => 'nullable|string|max:30',
            'sort'      => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        if (Lookup::where('type', $data['type'])->where('key', $data['key'])->exists()) {
            return response()->json(['message' => 'A lookup with this key already exists for this type.'], 422);
        }

        $data['sort']      = $data['sort']      ?? (Lookup::ofType($data['type'])->max('sort') + 1);
        $data['is_active'] = $data['is_active'] ?? true;

        return response()->json(Lookup::create($data), 201);
    }

    public function update(Request $request, Lookup $lookup)
    {
        $data = $request->validate([
            'label_en'  => 'sometimes|string|max:100',
            'label_ar'  => 'nullable|string|max:100',
            'color'     => 'nullable|string|max:30',
            'sort'      => 'sometimes|integer',
            'is_active' => 'sometimes|boolean',
        ]);

        $lookup->update($data);
        return response()->json($lookup);
    }

    public function destroy(Lookup $lookup)
    {
        $lookup->delete();
        return response()->json(['message' => 'Deleted']);
    }
}
