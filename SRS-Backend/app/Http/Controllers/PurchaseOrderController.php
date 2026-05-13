<?php

namespace App\Http\Controllers;

use App\Models\Prf;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class PurchaseOrderController extends Controller
{
    // ── allowed roles ────────────────────────────────────────────────────────
    private function canAccess(): bool
    {
        $role = auth()->user()?->role;
        return in_array($role, ['admin', 'depot_manager', 'purchasing'], true)
            || auth()->user()?->isAdmin();
    }

    // ─────────────────────────────────────────────────────────────
    //  LIST  — optionally filtered by prf_id
    // ─────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        if (! $this->canAccess()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $query = PurchaseOrder::with(['prf:id,prf_number', 'creator:id,name', 'items', 'igi:id,igi_number,status,po_id'])
            ->orderByDesc('created_at');

        if ($request->filled('prf_id')) {
            $query->where('prf_id', $request->prf_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    // ─────────────────────────────────────────────────────────────
    //  SHOW
    // ─────────────────────────────────────────────────────────────
    public function show(PurchaseOrder $po): JsonResponse
    {
        if (! $this->canAccess()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $po->load(['prf.requester:id,name,e_signature', 'creator:id,name', 'items', 'igi:id,igi_number,status']);

        return response()->json(['success' => true, 'data' => $po]);
    }

    // ─────────────────────────────────────────────────────────────
    //  STORE  — creates a PO from an approved PRF
    // ─────────────────────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        if (! $this->canAccess()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $v = Validator::make($request->all(), [
            'prf_id'           => 'required|exists:prfs,id',
            'po_number'        => 'nullable|string|max:64|unique:purchase_orders,po_number',
            'date'             => 'nullable|date',
            'category'         => 'nullable|string|max:255',
            'vendor'           => 'nullable|string|max:500',
            'tax'              => 'nullable|numeric|min:0',
            'withholding_tax'  => 'nullable|numeric|min:0',
            'delivery_terms'   => 'nullable|string|max:500',
            'delivery_period'  => 'nullable|string|max:255',
            'payment_terms'    => 'nullable|string|max:255',
            'receipt_location' => 'nullable|string|max:255',
            'comments'         => 'nullable|string|max:2000',
            'items'            => 'required|array|min:1',
            'items.*.prf_item_id'      => 'nullable|exists:prf_items,id',
            'items.*.item_description' => 'required|string|max:500',
            'items.*.stock'            => 'nullable|string|max:255',
            'items.*.average_con'      => 'nullable|string|max:255',
            'items.*.qty'              => 'required|numeric|min:0',
            'items.*.unit'             => 'nullable|string|max:50',
            'items.*.unit_price'       => 'nullable|numeric|min:0',
            'items.*.remark'           => 'nullable|string|max:500',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();
        $prf  = Prf::findOrFail($data['prf_id']);

        if ($prf->status !== 'approved') {
            return response()->json([
                'success' => false,
                'message' => 'A PO can only be created for a fully approved PRF',
            ], 422);
        }

        // Only one PO per PRF
        if ($prf->purchaseOrder()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'A Purchase Order already exists for this PRF',
            ], 422);
        }

        return DB::transaction(function () use ($data, $prf) {
            $po = PurchaseOrder::create([
                'po_number'        => $data['po_number'] ?? PurchaseOrder::generateNumber(),
                'prf_id'           => $prf->id,
                'created_by'       => auth()->id(),
                'date'             => $data['date'] ?? now()->toDateString(),
                'category'         => $data['category']         ?? null,
                'vendor'           => $data['vendor']           ?? null,
                'tax'              => $data['tax']              ?? 0,
                'withholding_tax'  => $data['withholding_tax']  ?? 0,
                'delivery_terms'   => $data['delivery_terms']   ?? null,
                'delivery_period'  => $data['delivery_period']  ?? 'Week',
                'payment_terms'    => $data['payment_terms']    ?? '100% After Received',
                'receipt_location' => $data['receipt_location'] ?? 'Company Warehouse',
                'comments'         => $data['comments']         ?? 'Banking Transfer',
                'status'           => 'draft',
            ]);

            foreach ($data['items'] as $i => $row) {
                $qty        = (float) $row['qty'];
                $unit_price = isset($row['unit_price']) ? (float) $row['unit_price'] : null;
                $total      = ($unit_price !== null) ? round($qty * $unit_price, 2) : null;

                PurchaseOrderItem::create([
                    'po_id'            => $po->id,
                    'prf_item_id'      => $row['prf_item_id'] ?? null,
                    'no'               => $i + 1,
                    'item_description' => $row['item_description'],
                    'stock'            => $row['stock']       ?? null,
                    'average_con'      => $row['average_con'] ?? null,
                    'qty'              => $qty,
                    'unit'             => $row['unit']        ?? 'pcs',
                    'unit_price'       => $unit_price,
                    'total'            => $total,
                    'remark'           => $row['remark']      ?? null,
                ]);
            }

            return response()->json([
                'success' => true,
                'data'    => $po->fresh(['prf.requester', 'creator', 'items']),
            ], 201);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE  — edit vendor, prices, items, etc.
    // ─────────────────────────────────────────────────────────────
    public function update(Request $request, PurchaseOrder $po): JsonResponse
    {
        if (! $this->canAccess()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $v = Validator::make($request->all(), [
            'po_number'        => "nullable|string|max:64|unique:purchase_orders,po_number,{$po->id}",
            'date'             => 'nullable|date',
            'category'         => 'nullable|string|max:255',
            'vendor'           => 'nullable|string|max:500',
            'tax'              => 'nullable|numeric|min:0',
            'withholding_tax'  => 'nullable|numeric|min:0',
            'delivery_terms'   => 'nullable|string|max:500',
            'delivery_period'  => 'nullable|string|max:255',
            'payment_terms'    => 'nullable|string|max:255',
            'receipt_location' => 'nullable|string|max:255',
            'comments'         => 'nullable|string|max:2000',
            'status'           => 'nullable|in:draft,issued,received,cancelled',
            'items'            => 'sometimes|array|min:1',
            'items.*.prf_item_id'      => 'nullable|exists:prf_items,id',
            'items.*.item_description' => 'required_with:items|string|max:500',
            'items.*.stock'            => 'nullable|string|max:255',
            'items.*.average_con'      => 'nullable|string|max:255',
            'items.*.qty'              => 'required_with:items|numeric|min:0',
            'items.*.unit'             => 'nullable|string|max:50',
            'items.*.unit_price'       => 'nullable|numeric|min:0',
            'items.*.remark'           => 'nullable|string|max:500',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        return DB::transaction(function () use ($po, $data) {
            $po->update(array_filter([
                'po_number'        => $data['po_number']        ?? null,
                'date'             => $data['date']             ?? null,
                'category'         => $data['category']         ?? null,
                'vendor'           => $data['vendor']           ?? null,
                'tax'              => $data['tax']              ?? null,
                'withholding_tax'  => $data['withholding_tax']  ?? null,
                'delivery_terms'   => $data['delivery_terms']   ?? null,
                'delivery_period'  => $data['delivery_period']  ?? null,
                'payment_terms'    => $data['payment_terms']    ?? null,
                'receipt_location' => $data['receipt_location'] ?? null,
                'comments'         => $data['comments']         ?? null,
                'status'           => $data['status']           ?? null,
            ], fn($v) => $v !== null));

            if (isset($data['items'])) {
                $po->items()->delete();
                foreach ($data['items'] as $i => $row) {
                    $qty        = (float) $row['qty'];
                    $unit_price = isset($row['unit_price']) ? (float) $row['unit_price'] : null;
                    $total      = ($unit_price !== null) ? round($qty * $unit_price, 2) : null;

                    PurchaseOrderItem::create([
                        'po_id'            => $po->id,
                        'prf_item_id'      => $row['prf_item_id'] ?? null,
                        'no'               => $i + 1,
                        'item_description' => $row['item_description'],
                        'stock'            => $row['stock']       ?? null,
                        'average_con'      => $row['average_con'] ?? null,
                        'qty'              => $qty,
                        'unit'             => $row['unit']        ?? 'pcs',
                        'unit_price'       => $unit_price,
                        'total'            => $total,
                        'remark'           => $row['remark']      ?? null,
                    ]);
                }
            }

            return response()->json([
                'success' => true,
                'data'    => $po->fresh(['prf.requester', 'creator', 'items']),
            ]);
        });
    }
}
