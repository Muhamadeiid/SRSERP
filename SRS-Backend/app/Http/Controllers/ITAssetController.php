<?php

namespace App\Http\Controllers;

use App\Models\ITAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ITAssetController extends Controller
{
    // GET /api/it-assets
    public function index(Request $request): JsonResponse
    {
        $q = ITAsset::latest();

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('item',         'like', "%{$term}%")
                      ->orWhere('asset_no',   'like', "%{$term}%")
                      ->orWhere('name',        'like', "%{$term}%")
                      ->orWhere('serial_number','like', "%{$term}%")
                      ->orWhere('user_name',   'like', "%{$term}%")
                      ->orWhere('location',    'like', "%{$term}%");
            });
        }

        if ($request->filled('item')) {
            $q->where('item', $request->item);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $q->where('status', $request->status);
        }

        if ($request->filled('condition') && $request->condition !== 'all') {
            $q->where('condition', $request->condition);
        }

        $perPage = (int) $request->get('per_page', 50);
        $result  = $q->paginate($perPage);

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

    public function stats(): JsonResponse
    {
        $counts = ITAsset::selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'total'       => (int) $counts->sum(),
            'available'   => (int) ($counts['Available'] ?? 0),
            'assigned'    => (int) ($counts['Assigned'] ?? 0),
            'damaged'     => (int) ($counts['Damaged'] ?? 0),
            'lost'        => (int) ($counts['Lost'] ?? 0),
            'maintenance' => (int) ($counts['Maintenance'] ?? 0),
            'good'        => ITAsset::where('condition', 'Good')->count(),
        ]);
    }

    // POST /api/it-assets
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item'                  => 'required|string|max:100',
            'asset_no'              => 'nullable|string|max:100',
            'name'                  => 'required|string|max:255',
            'qty'                   => 'nullable|integer|min:1',
            'serial_number'         => 'nullable|string|max:100',
            'purpose'               => 'nullable|string|max:255',
            'location'              => 'nullable|string|max:255',
            'registration_date'     => 'nullable|date',
            'account_registration'  => 'nullable|string|max:100',
            'user_name'             => 'nullable|string|max:255',
            'managing_staff'        => 'nullable|string|max:255',
            'maintenance_frequency' => 'nullable|string|max:100',
            'activity'              => 'nullable|string|max:255',
            'condition'             => 'nullable|in:Good,Damaged,Lost',
            'status'                => 'nullable|in:Available,Assigned,Damaged,Lost,Maintenance',
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $validated = $validator->validated();
        if (!empty($validated['user_name']) && empty($validated['status'])) {
            $validated['status'] = 'Assigned';
        }

        $asset = ITAsset::create([
            ...$validated,
            'qty'        => $request->input('qty', 1),
            'created_by' => auth()->id(),
        ]);

        return response()->json(['success' => true, 'data' => $asset], 201);
    }

    // PUT /api/it-assets/{id}
    public function update(Request $request, ITAsset $itAsset): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item'                  => 'sometimes|required|string|max:100',
            'asset_no'              => 'nullable|string|max:100',
            'name'                  => 'sometimes|required|string|max:255',
            'qty'                   => 'nullable|integer|min:1',
            'serial_number'         => 'nullable|string|max:100',
            'purpose'               => 'nullable|string|max:255',
            'location'              => 'nullable|string|max:255',
            'registration_date'     => 'nullable|date',
            'account_registration'  => 'nullable|string|max:100',
            'user_name'             => 'nullable|string|max:255',
            'managing_staff'        => 'nullable|string|max:255',
            'maintenance_frequency' => 'nullable|string|max:100',
            'activity'              => 'nullable|string|max:255',
            'condition'             => 'nullable|in:Good,Damaged,Lost',
            'status'                => 'nullable|in:Available,Assigned,Damaged,Lost,Maintenance',
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $data = $validator->validated();
        $activeHolder = $itAsset->employeeAssets()
            ->where('status', 'Active')
            ->with('employee:id,name')
            ->first();

        if ($activeHolder) {
            $data['status'] = 'Assigned';
            $data['condition'] = 'Good';
            $data['user_name'] = $activeHolder->employee?->name;
        } else {
            $condition = $data['condition'] ?? $itAsset->condition;
            if ($condition === 'Damaged') $data['status'] = 'Damaged';
            if ($condition === 'Lost') $data['status'] = 'Lost';
            if (($data['status'] ?? null) === 'Available') $data['condition'] = 'Good';
            if (($data['status'] ?? null) === 'Assigned') $data['status'] = 'Available';
        }

        $itAsset->update($data);

        return response()->json(['success' => true, 'data' => $itAsset->fresh()]);
    }

    // DELETE /api/it-assets/{id}
    public function destroy(ITAsset $itAsset): JsonResponse
    {
        if ($itAsset->employeeAssets()->where('status', 'Active')->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Return this asset before deleting it',
            ], 422);
        }
        $itAsset->delete();
        return response()->json(['success' => true]);
    }

    /**
     * POST /api/it-assets/{itAsset}/assign
     * Hand this inventory item to an employee: creates a linked
     * employee_assets row so the clearance form and asset return flow
     * stay in sync with the IT registry.
     */
    public function assign(Request $request, ITAsset $itAsset): JsonResponse
    {
        $data = $request->validate([
            'employee_id'       => 'required|exists:employees,id',
            'issuing_source_id' => 'nullable|exists:issuing_sources,id',
            'received_date'     => 'nullable|date',
            'condition'         => 'nullable|in:Good,Damaged,Lost',
            'notes'             => 'nullable|string|max:1000',
        ]);

        if ($itAsset->status !== 'Available' || $itAsset->condition !== 'Good') {
            return response()->json([
                'success' => false,
                'message' => 'This IT asset is not available for assignment',
            ], 422);
        }

        $activeHolder = \App\Models\EmployeeAsset::where('it_asset_id', $itAsset->id)
            ->where('status', 'Active')
            ->with('employee:id,name')
            ->first();

        if ($activeHolder) {
            return response()->json([
                'success' => false,
                'message' => 'This IT asset is already assigned to ' . ($activeHolder->employee?->name ?? 'another employee'),
            ], 422);
        }

        // Default the source to whichever issuing_source has key='it'.
        $sourceId = $data['issuing_source_id']
            ?? \App\Models\IssuingSource::where('key', 'it')->value('id');

        $asset = \App\Models\EmployeeAsset::create([
            'employee_id'         => $data['employee_id'],
            'issuing_source_id'   => $sourceId,
            'it_asset_id'         => $itAsset->id,
            'issuing_department'  => 'IT',
            'asset_name'          => trim(($itAsset->item ?? '') . ' — ' . ($itAsset->name ?? ''), ' —'),
            'asset_code'          => $itAsset->asset_no,
            'asset_category'      => 'Device',
            'received_date'       => $data['received_date'] ?? now()->toDateString(),
            'condition'           => $data['condition'] ?? 'Good',
            'status'              => 'Active',
            'notes'               => $data['notes'] ?? null,
            'created_by'          => auth()->id(),
        ]);

        // Mirror the current holder on the IT record so the inventory
        // dashboard reflects who's using the item today.
        $emp = \App\Models\Employee::find($data['employee_id']);
        if ($emp) {
            $itAsset->update(['user_name' => $emp->name, 'status' => 'Assigned']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Assigned',
            'data'    => $asset->load('employee:id,name,ibs_code,department', 'itAsset', 'issuingSource'),
        ], 201);
    }
}
