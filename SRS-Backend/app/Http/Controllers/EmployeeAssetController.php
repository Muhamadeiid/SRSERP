<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\ITAsset;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class EmployeeAssetController extends Controller
{
    // ── GET /api/assets ────────────────────────────────────────
    // List assets with optional filters: employee_id, department, status, search
    public function index(Request $request): JsonResponse
    {
        $q = EmployeeAsset::with(['employee:id,name,ibs_code,department,position,status'])
                          ->latest();

        if ($request->filled('employee_id'))
            $q->forEmployee($request->employee_id);

        if ($request->filled('department') && $request->department !== 'all')
            $q->byDepartment($request->department);

        if ($request->filled('status') && $request->status !== 'all')
            $q->where('status', $request->status);

        if ($request->filled('search')) {
            $term = $request->search;
            $q->where(function ($inner) use ($term) {
                $inner->where('asset_name', 'like', "%{$term}%")
                      ->orWhere('asset_code', 'like', "%{$term}%")
                      ->orWhereHas('employee', fn($e) => $e->where('name', 'like', "%{$term}%"));
            });
        }

        $perPage = (int) $request->get('per_page', 20);
        $result  = $q->paginate($perPage);

        return response()->json([
            'data'       => $result->items(),
            'pagination' => [
                'total'        => $result->total(),
                'per_page'     => $result->perPage(),
                'current_page' => $result->currentPage(),
                'last_page'    => $result->lastPage(),
            ],
        ]);
    }

    // ── POST /api/assets ───────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'employee_id'        => 'required|exists:employees,id',
            'issuing_source_id'  => 'required|exists:issuing_sources,id',
            'it_asset_id'        => 'nullable|exists:it_assets,id',
            'asset_name'         => 'required|string|max:255',
            'asset_code'         => 'nullable|string|max:100',
            'asset_category'     => 'nullable|string|max:100',
            'received_date'      => 'required|date',
            'condition'          => 'nullable|in:Good,Damaged,Lost',
            'notes'              => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $data = $validator->validated();

        if (!empty($data['it_asset_id'])) {
            $activeHolder = EmployeeAsset::where('it_asset_id', $data['it_asset_id'])
                ->where('status', 'Active')
                ->with('employee:id,name')
                ->first();

            if ($activeHolder) {
                return response()->json([
                    'success' => false,
                    'message' => 'This IT asset is already assigned to ' . ($activeHolder->employee?->name ?? 'another employee'),
                ], 422);
            }
        }

        // Keep the legacy enum in sync with the source label so legacy readers
        // (old clearance form, etc.) keep working.
        $source = \App\Models\IssuingSource::find($data['issuing_source_id']);
        $data['issuing_department'] = $source ? $source->label_en : 'Other';

        $asset = EmployeeAsset::create([
            ...$data,
            'status'     => 'Active',
            'created_by' => auth()->id(),
        ]);

        if (!empty($data['it_asset_id'])) {
            ITAsset::whereKey($data['it_asset_id'])->update([
                'user_name' => Employee::whereKey($data['employee_id'])->value('name'),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Asset assigned successfully',
            'data'    => $asset->load('employee:id,name,ibs_code,department', 'issuingSource', 'itAsset'),
        ], 201);
    }

    // ── GET /api/assets/{id} ───────────────────────────────────
    public function show(EmployeeAsset $asset): JsonResponse
    {
        return response()->json($asset->load('employee:id,name,ibs_code,department,position'));
    }

    // ── PUT /api/assets/{id} ───────────────────────────────────
    public function update(Request $request, EmployeeAsset $asset): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'issuing_department' => 'sometimes|in:EHS,Corrective Maintenance,Preventive Maintenance,Inventory,IT,HR,Other',
            'asset_name'         => 'sometimes|string|max:255',
            'asset_code'         => 'nullable|string|max:100',
            'asset_category'     => 'nullable|string|max:100',
            'received_date'      => 'sometimes|date',
            'return_date'        => 'nullable|date',
            'condition'          => 'nullable|in:Good,Damaged,Lost',
            'status'             => 'sometimes|in:Active,Returned',
            'notes'              => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $asset->update($validator->validated());
        if ($asset->status === 'Returned') {
            $this->releaseLinkedItAsset($asset);
        }

        return response()->json([
            'success' => true,
            'message' => 'Asset updated',
            'data'    => $asset->fresh('employee:id,name,ibs_code,department'),
        ]);
    }

    // ── DELETE /api/assets/{id} ────────────────────────────────
    public function destroy(EmployeeAsset $asset): JsonResponse
    {
        $asset->delete();
        return response()->json(['success' => true, 'message' => 'Asset deleted']);
    }

    // ── POST /api/assets/{id}/return ──────────────────────────
    // Mark a single asset as returned
    public function markReturned(Request $request, EmployeeAsset $asset): JsonResponse
    {
        $asset->update([
            'status'      => 'Returned',
            'return_date' => $request->input('return_date', today()->toDateString()),
            'condition'   => $request->input('condition', $asset->condition),
        ]);

        $this->releaseLinkedItAsset($asset);

        return response()->json([
            'success' => true,
            'message' => 'Asset marked as returned',
            'data'    => $asset,
        ]);
    }

    // ── GET /api/assets/clearance/{employee_id} ────────────────
    // Full clearance report for one employee (all active assets grouped by dept)
    public function clearance(int $employeeId): JsonResponse
    {
        $employee = Employee::findOrFail($employeeId);

        $allAssets = EmployeeAsset::forEmployee($employeeId)
                        ->with('creator:id,name')
                        ->orderBy('issuing_department')
                        ->orderBy('received_date')
                        ->get();

        $active   = $allAssets->where('status', 'Active');
        $returned = $allAssets->where('status', 'Returned');

        // Group active assets by issuing department
        $byDepartment = $active->groupBy('issuing_department')->map(function ($items, $dept) {
            return [
                'department' => $dept,
                'count'      => $items->count(),
                'assets'     => $items->values(),
            ];
        })->values();

        return response()->json([
            'success'  => true,
            'data'     => [
                'employee'      => $employee->only(['id','name','ibs_code','department','position','status']),
                'generated_at'  => now()->toDateTimeString(),
                'active_count'  => $active->count(),
                'returned_count'=> $returned->count(),
                'by_department' => $byDepartment,
                'all_assets'    => $allAssets,
            ],
        ]);
    }

    // ── GET /api/assets/stats ──────────────────────────────────
    public function stats(): JsonResponse
    {
        return response()->json([
            'total'         => EmployeeAsset::count(),
            'active'        => EmployeeAsset::where('status', 'Active')->count(),
            'returned'      => EmployeeAsset::where('status', 'Returned')->count(),
            'by_department' => EmployeeAsset::selectRaw('issuing_department, count(*) as count, sum(status="Active") as active')
                                ->groupBy('issuing_department')
                                ->get(),
        ]);
    }

    private function releaseLinkedItAsset(EmployeeAsset $asset): void
    {
        if (!$asset->it_asset_id) {
            return;
        }

        $hasAnotherActiveHolder = EmployeeAsset::where('it_asset_id', $asset->it_asset_id)
            ->where('id', '!=', $asset->id)
            ->where('status', 'Active')
            ->exists();

        if (!$hasAnotherActiveHolder) {
            ITAsset::whereKey($asset->it_asset_id)->update(['user_name' => null]);
        }
    }
}
