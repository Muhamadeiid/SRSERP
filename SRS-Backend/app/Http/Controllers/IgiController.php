<?php

namespace App\Http\Controllers;

use App\Models\IgiItem;
use App\Models\IncomingGoodsInspection;
use App\Models\PurchaseOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class IgiController extends Controller
{
    private function canAccess($user): bool
    {
        return $user->isAdmin()
            || in_array($user->role, ['depot_manager', 'purchasing']);
    }

    // ─────────────────────────────────────────────────────────────
    //  LIST
    // ─────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canAccess($user)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $query = IncomingGoodsInspection::with([
            'creator:id,name,role',
            'po:id,po_number,prf_id,vendor,date',
            'po.prf:id,prf_number,requested_by',
            'po.prf.requester:id,name',
            'items',
        ])->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    // ─────────────────────────────────────────────────────────────
    //  SHOW
    // ─────────────────────────────────────────────────────────────
    public function show(IncomingGoodsInspection $igi): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canAccess($user)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $igi->load([
            'creator:id,name,role',
            'po:id,po_number,prf_id,vendor,date,status',
            'po.prf:id,prf_number,requested_by',
            'po.prf.requester:id,name',
            'items',
        ]);

        return response()->json(['success' => true, 'data' => $igi]);
    }

    // ─────────────────────────────────────────────────────────────
    //  STORE
    // ─────────────────────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canAccess($user)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $v = Validator::make($request->all(), [
            'po_id'                     => 'required|exists:purchase_orders,id',
            'date'                      => 'nullable|date',
            'supplier_name'             => 'nullable|string|max:255',
            'delivery_note_no'          => 'nullable|string|max:100',
            'photos_notes'              => 'nullable|string|max:2000',
            'photos'                    => 'nullable|array',
            'photos.*'                  => 'nullable|string',
            'items'                     => 'required|array|min:1',
            'items.*.description'       => 'nullable|string|max:500',
            'items.*.system'            => 'nullable|string|max:255',
            'items.*.batch_no'          => 'nullable|string|max:255',
            'items.*.qty_received'      => 'nullable|numeric|min:0',
            'items.*.unit'              => 'nullable|string|max:50',
            'items.*.shelf_life'        => 'nullable|numeric|min:0',
            'items.*.compliant_po'      => 'nullable|boolean',
            'items.*.compliant_technical' => 'nullable|boolean',
            'items.*.compliant_ehs'     => 'nullable|boolean',
            'items.*.remarks'           => 'nullable|string|max:1000',
            'items.*.po_item_id'        => 'nullable|exists:purchase_order_items,id',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        $po = PurchaseOrder::find($data['po_id']);
        if (!$po) {
            return response()->json(['success' => false, 'message' => 'PO not found'], 404);
        }

        // PO must be received before an IGI can be created
        if ($po->status !== 'received') {
            return response()->json(['success' => false, 'message' => 'IGI can only be created for a received PO'], 422);
        }

        // One IGI per PO
        if (IncomingGoodsInspection::where('po_id', $po->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'An IGI already exists for this PO'], 422);
        }

        return DB::transaction(function () use ($data, $user, $po) {
            $igi = IncomingGoodsInspection::create([
                'igi_number'      => IncomingGoodsInspection::generateNumber(),
                'po_id'           => $po->id,
                'created_by'      => $user->id,
                'date'            => $data['date'] ?? now()->toDateString(),
                'supplier_name'   => $data['supplier_name'] ?? $po->vendor,
                'delivery_note_no'=> $data['delivery_note_no'] ?? null,
                'photos_notes'    => $data['photos_notes'] ?? null,
                'photos'          => $data['photos']       ?? [],
                'status'          => 'draft',
            ]);

            foreach ($data['items'] as $i => $row) {
                IgiItem::create([
                    'igi_id'             => $igi->id,
                    'po_item_id'         => $row['po_item_id'] ?? null,
                    'no'                 => $i + 1,
                    'description'        => $row['description'] ?? null,
                    'system'             => $row['system'] ?? null,
                    'batch_no'           => $row['batch_no'] ?? null,
                    'qty_received'       => $row['qty_received'] ?? null,
                    'unit'               => $row['unit'] ?? null,
                    'shelf_life'         => $row['shelf_life'] ?? null,
                    'compliant_po'       => $row['compliant_po'] ?? null,
                    'compliant_technical'=> $row['compliant_technical'] ?? null,
                    'compliant_ehs'      => $row['compliant_ehs'] ?? null,
                    'remarks'            => $row['remarks'] ?? null,
                ]);
            }

            $igi->load([
                'creator:id,name,role',
                'po:id,po_number,prf_id,vendor,date',
                'po.prf:id,prf_number,requested_by',
                'po.prf.requester:id,name',
                'items',
            ]);

            return response()->json(['success' => true, 'data' => $igi], 201);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE
    // ─────────────────────────────────────────────────────────────
    public function update(Request $request, IncomingGoodsInspection $igi): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canAccess($user)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $v = Validator::make($request->all(), [
            'date'                        => 'nullable|date',
            'supplier_name'               => 'nullable|string|max:255',
            'delivery_note_no'            => 'nullable|string|max:100',
            'photos_notes'                => 'nullable|string|max:2000',
            'photos'                      => 'nullable|array',
            'photos.*'                    => 'nullable|string',
            'status'                      => 'nullable|in:draft,submitted,approved,rejected',
            'items'                       => 'nullable|array',
            'items.*.description'         => 'nullable|string|max:500',
            'items.*.system'              => 'nullable|string|max:255',
            'items.*.batch_no'            => 'nullable|string|max:255',
            'items.*.qty_received'        => 'nullable|numeric|min:0',
            'items.*.unit'                => 'nullable|string|max:50',
            'items.*.shelf_life'          => 'nullable|numeric|min:0',
            'items.*.compliant_po'        => 'nullable|boolean',
            'items.*.compliant_technical' => 'nullable|boolean',
            'items.*.compliant_ehs'       => 'nullable|boolean',
            'items.*.remarks'             => 'nullable|string|max:1000',
            'items.*.po_item_id'          => 'nullable|exists:purchase_order_items,id',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        return DB::transaction(function () use ($igi, $data) {
            $igi->update(array_filter([
                'date'            => $data['date']            ?? null,
                'supplier_name'   => $data['supplier_name']   ?? null,
                'delivery_note_no'=> $data['delivery_note_no']?? null,
                'photos_notes'    => $data['photos_notes']    ?? null,
                'photos'          => $data['photos']          ?? null,
                'status'          => $data['status']          ?? null,
            ], fn($v) => $v !== null));

            if (!empty($data['items'])) {
                $igi->items()->delete();
                foreach ($data['items'] as $i => $row) {
                    IgiItem::create([
                        'igi_id'             => $igi->id,
                        'po_item_id'         => $row['po_item_id'] ?? null,
                        'no'                 => $i + 1,
                        'description'        => $row['description'] ?? null,
                        'system'             => $row['system'] ?? null,
                        'batch_no'           => $row['batch_no'] ?? null,
                        'qty_received'       => $row['qty_received'] ?? null,
                        'unit'               => $row['unit'] ?? null,
                        'shelf_life'         => $row['shelf_life'] ?? null,
                        'compliant_po'       => $row['compliant_po'] ?? null,
                        'compliant_technical'=> $row['compliant_technical'] ?? null,
                        'compliant_ehs'      => $row['compliant_ehs'] ?? null,
                        'remarks'            => $row['remarks'] ?? null,
                    ]);
                }
            }

            $igi->load([
                'creator:id,name,role',
                'po:id,po_number,prf_id,vendor,date',
                'po.prf:id,prf_number,requested_by',
                'po.prf.requester:id,name',
                'items',
            ]);

            return response()->json(['success' => true, 'data' => $igi]);
        });
    }
}
