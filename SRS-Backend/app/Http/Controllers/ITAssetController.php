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
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $asset = ITAsset::create([
            ...$validator->validated(),
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
            'notes'                 => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);

        $itAsset->update($validator->validated());

        return response()->json(['success' => true, 'data' => $itAsset->fresh()]);
    }

    // DELETE /api/it-assets/{id}
    public function destroy(ITAsset $itAsset): JsonResponse
    {
        $itAsset->delete();
        return response()->json(['success' => true]);
    }
}
