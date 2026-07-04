<?php

namespace App\Http\Controllers;

use App\Models\EmployeeAsset;
use App\Models\IssuingSource;
use Illuminate\Http\Request;

class IssuingSourceController extends Controller
{
    public function index()
    {
        $sources = IssuingSource::with('manager:id,name')
            ->orderBy('sort')->orderBy('id')->get();

        // Live count of active assets per source.
        $counts = EmployeeAsset::where('status', 'Active')
            ->selectRaw('issuing_source_id, COUNT(*) as c')
            ->groupBy('issuing_source_id')
            ->pluck('c', 'issuing_source_id');

        return response()->json($sources->map(function ($s) use ($counts) {
            $s->active_assets_count = (int) ($counts[$s->id] ?? 0);
            $s->signatory_name = $s->signatoryName();
            return $s;
        }));
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        if (IssuingSource::where('key', $data['key'])->exists()) {
            return response()->json(['message' => 'Key already exists'], 422);
        }

        $data['sort'] = $data['sort'] ?? (IssuingSource::max('sort') + 1);
        $data['is_active'] = $data['is_active'] ?? true;

        return response()->json(IssuingSource::create($data), 201);
    }

    public function update(Request $request, IssuingSource $issuingSource)
    {
        $data = $this->validated($request);
        $issuingSource->update($data);
        return response()->json($issuingSource->load('manager:id,name'));
    }

    public function destroy(IssuingSource $issuingSource)
    {
        $active = EmployeeAsset::where('issuing_source_id', $issuingSource->id)
            ->where('status', 'Active')->count();
        if ($active > 0) {
            return response()->json([
                'message' => "Cannot delete: {$active} active asset(s) come from this source. Deactivate it instead.",
            ], 422);
        }

        $issuingSource->delete();
        return response()->json(['message' => 'Deleted']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'key'             => 'sometimes|required|string|max:50',
            'label_en'        => 'sometimes|required|string|max:100',
            'label_ar'        => 'nullable|string|max:100',
            'manager_user_id' => 'nullable|exists:users,id',
            'manager_name'    => 'nullable|string|max:150',
            'is_active'       => 'nullable|boolean',
            'sort'            => 'nullable|integer',
        ]);
    }
}
