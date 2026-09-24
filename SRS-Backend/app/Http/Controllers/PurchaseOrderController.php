<?php

namespace App\Http\Controllers;

use App\Models\Prf;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseOrderApproval;
use App\Models\ProcurementQuotation;
use App\Models\ProcurementBudgetPlan;
use App\Models\Notification;
use App\Services\ProcurementSopPolicy;
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
        return in_array($role, ['admin', 'depot_manager', 'procurement', 'purchasing'], true)
            || auth()->user()?->isAdmin();
    }

    private function canManage(): bool
    {
        $user = auth()->user();
        return $user && ($user->isAdmin() || in_array($user->role, ['procurement', 'purchasing'], true));
    }

    // ─────────────────────────────────────────────────────────────
    //  LIST  — optionally filtered by prf_id
    // ─────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        if (! $this->canManage()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $query = PurchaseOrder::with(['prf:id,prf_number', 'creator:id,name', 'items', 'igi:id,igi_number,status,po_id', 'approvals.approver:id,name,e_signature', 'selectedQuotation.supplier'])
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

        $po->load(['prf.requester:id,name,e_signature', 'creator:id,name,e_signature', 'items', 'igi:id,igi_number,status', 'approvals.approver:id,name,e_signature', 'selectedQuotation.supplier']);

        return response()->json(['success' => true, 'data' => $po]);
    }

    // ─────────────────────────────────────────────────────────────
    //  STORE  — creates a PO from an approved PRF
    // ─────────────────────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        if (! $this->canManage()) {
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
            'sole_supplier'    => 'nullable|boolean',
            'sole_supplier_justification' => 'nullable|string|max:3000',
            'direct_order'     => 'nullable|boolean',
            'direct_order_reason' => 'nullable|string|max:3000',
            'budget_plan_id'    => 'nullable|exists:procurement_budget_plans,id',
            'selected_quotation_id' => 'nullable|exists:procurement_quotations,id',
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

        if (!empty($data['selected_quotation_id'])) {
            $validQuote = ProcurementQuotation::whereKey($data['selected_quotation_id'])
                ->where('prf_id', $prf->id)->exists();
            if (!$validQuote) {
                return response()->json(['success' => false, 'message' => 'Selected quotation does not belong to this PRF'], 422);
            }
        }

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
                'approval_status'  => 'draft',
                'sole_supplier'    => $data['sole_supplier'] ?? false,
                'sole_supplier_justification' => $data['sole_supplier_justification'] ?? null,
                'direct_order'     => $data['direct_order'] ?? false,
                'direct_order_reason' => $data['direct_order_reason'] ?? null,
                'budget_plan_id'    => $data['budget_plan_id'] ?? null,
                'selected_quotation_id' => $data['selected_quotation_id'] ?? null,
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
        if (! $this->canManage()) {
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
            'sole_supplier'    => 'nullable|boolean',
            'sole_supplier_justification' => 'nullable|string|max:3000',
            'direct_order'     => 'nullable|boolean',
            'direct_order_reason' => 'nullable|string|max:3000',
            'budget_plan_id'    => 'nullable|exists:procurement_budget_plans,id',
            'selected_quotation_id' => 'nullable|exists:procurement_quotations,id',
            'payment_status'   => 'nullable|in:unpaid,processing,paid',
            'payment_method'   => 'nullable|in:cash,check,bank_transfer',
            'payment_reference'=> 'nullable|string|max:255',
            'dispatched_at'    => 'nullable|date',
            'dispatched_to'    => 'nullable|string|max:255',
            'dispatch_reference' => 'nullable|string|max:255',
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

        $commercialFields = [
            'po_number','date','category','vendor','tax','withholding_tax','delivery_terms',
            'delivery_period','payment_terms','receipt_location','comments','sole_supplier',
            'sole_supplier_justification','direct_order','direct_order_reason','budget_plan_id','selected_quotation_id','items',
        ];
        if (!in_array($po->approval_status, ['draft', 'rejected'], true)
            && array_intersect(array_keys($data), $commercialFields)) {
            return response()->json(['message' => 'Approved PO commercial data is locked; cancel and create a new cycle to change it'], 422);
        }

        if (isset($data['status']) && $data['status'] !== $po->status) {
            $allowedTransition = match ($data['status']) {
                'cancelled' => true,
                'issued' => $po->approval_status === 'approved',
                'received' => $po->status === 'issued' && $po->approval_status === 'approved' && $po->dispatched_at,
                'draft' => in_array($po->approval_status, ['draft', 'rejected'], true),
                default => false,
            };
            if (!$allowedTransition) {
                return response()->json(['message' => 'Invalid PO status transition. An approved and dispatched PO is required before receipt'], 422);
            }
        }
        if (($data['payment_status'] ?? null) === 'paid') {
            if ($po->status !== 'received') {
                return response()->json(['message' => 'Payment can only be completed after the PO is received'], 422);
            }
            if (empty($data['payment_method']) || empty($data['payment_reference'])) {
                return response()->json(['message' => 'Payment method and reference are required'], 422);
            }
        }
        if (!empty($data['dispatched_at'])) {
            if ($po->approval_status !== 'approved' || $po->status !== 'issued') {
                return response()->json(['message' => 'Only an approved and issued PO can be dispatched to the vendor'], 422);
            }
            if (empty($data['dispatched_to']) || empty($data['dispatch_reference'])) {
                return response()->json(['message' => 'Dispatch recipient and reference are required'], 422);
            }
        }

        return DB::transaction(function () use ($po, $data) {
            $cancellingNow = ($data['status'] ?? null) === 'cancelled'
                && $po->status !== 'cancelled';

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
                'sole_supplier'    => $data['sole_supplier']    ?? null,
                'sole_supplier_justification' => $data['sole_supplier_justification'] ?? null,
                'direct_order'     => $data['direct_order']     ?? null,
                'direct_order_reason' => $data['direct_order_reason'] ?? null,
                'budget_plan_id'    => $data['budget_plan_id']    ?? null,
                'selected_quotation_id' => $data['selected_quotation_id'] ?? null,
                'payment_status'   => $data['payment_status']   ?? null,
                'payment_method'   => $data['payment_method']   ?? null,
                'payment_reference'=> $data['payment_reference']?? null,
                'paid_at'          => ($data['payment_status'] ?? null) === 'paid' ? now() : null,
                'dispatched_at'    => $data['dispatched_at']    ?? null,
                'dispatched_to'    => $data['dispatched_to']    ?? null,
                'dispatch_reference' => $data['dispatch_reference'] ?? null,
            ], fn($v) => $v !== null));

            // When PO is cancelled, void the linked PRF number so it can be reused
            if ($cancellingNow && $po->prf_id) {
                $prf = Prf::find($po->prf_id);
                if ($prf && ! str_ends_with($prf->prf_number, '-VOID')) {
                    $prf->update([
                        'prf_number' => $prf->prf_number . '-VOID',
                        'status'     => 'cancelled',
                    ]);
                }
            }

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

    public function submitForApproval(PurchaseOrder $po): JsonResponse
    {
        if (! $this->canManage()) return response()->json(['message' => 'Only Procurement can submit a PO for approval'], 403);
        if ($po->approval_status !== 'draft' && $po->approval_status !== 'rejected') {
            return response()->json(['message' => 'PO is already in the approval cycle'], 422);
        }
        $quotes = ProcurementQuotation::with('supplier')->where('prf_id', $po->prf_id)->get();
        if ($po->sole_supplier) {
            if (!filled($po->sole_supplier_justification)) {
                return response()->json(['message' => 'Sole supplier justification is required'], 422);
            }
        } elseif ($po->direct_order) {
            if (!filled($po->direct_order_reason)) {
                return response()->json(['message' => 'Direct order justification is required'], 422);
            }
            if (!$po->budget_plan_id || !ProcurementBudgetPlan::whereKey($po->budget_plan_id)->where('status', 'approved')->exists()) {
                return response()->json(['message' => 'Direct orders must reference an approved monthly budget plan'], 422);
            }
            if (!ProcurementSopPolicy::directOrderCategoryAllowed(
                $po->category,
                config('srs.direct_order_categories', [])
            )) {
                return response()->json(['message' => 'Direct orders are limited to urgent stationary, office supplies, or transportation'], 422);
            }
        } elseif (ProcurementSopPolicy::distinctSupplierCount($quotes) < 3) {
            return response()->json(['message' => 'Quotations from at least 3 different approved suppliers are required'], 422);
        }
        $selected = $quotes->firstWhere('id', $po->selected_quotation_id);
        if (!$selected) {
            return response()->json(['message' => 'Select the approved quotation before submitting the PO'], 422);
        }
        if (!ProcurementSopPolicy::quotationCanBeSelected($selected->technical_compliant, $selected->ehs_compliant, $selected->expiry_date)) {
            return response()->json(['message' => 'The selected quotation must be technically and EHS compliant and must not be expired'], 422);
        }
        if ($selected->supplier?->status !== 'approved') {
            return response()->json(['message' => 'The selected vendor is not currently approved'], 422);
        }
        $po->update(['vendor' => $selected->supplier->company_name]);
        $po->update(['approval_status' => 'pending_procurement']);
        Notification::notifyRole('procurement', 'po_approval_required', 'Purchase Order awaiting approval', "PO {$po->po_number} is ready for Procurement approval.", ['purchase_order_id'=>$po->id,'path'=>"/purchase-order/{$po->id}"], true);
        return response()->json(['success' => true, 'data' => $po->fresh(['approvals.approver','selectedQuotation.supplier'])]);
    }

    public function decide(Request $request, PurchaseOrder $po): JsonResponse
    {
        $user = auth()->user();
        $data = $request->validate(['action' => 'required|in:approve,reject', 'comment' => 'nullable|string|max:2000']);
        $stages = [
            'pending_procurement' => ['stage'=>'procurement','next'=>'pending_depot','allowed'=>fn()=> $user->isAdmin() || in_array($user->role,['procurement','purchasing'],true)],
            'pending_depot' => ['stage'=>'depot_manager','next'=>'pending_management','allowed'=>fn()=> $user->isAdmin() || $user->role==='depot_manager'],
            'pending_management' => ['stage'=>'managing_director','next'=>'approved','allowed'=>fn()=> $user->isAdmin()],
        ];
        $stage = $stages[$po->approval_status] ?? null;
        if (!$stage) return response()->json(['message'=>'PO is not awaiting approval'],422);
        if (!$stage['allowed']()) return response()->json(['message'=>'You cannot approve this PO stage'],403);

        return DB::transaction(function () use ($po,$user,$data,$stage) {
            PurchaseOrderApproval::create([
                'po_id'=>$po->id,'stage'=>$stage['stage'],'action'=>$data['action'],
                'approver_id'=>$user->id,'comment'=>$data['comment'] ?? null,'acted_at'=>now(),
            ]);
            Notification::resolveFor('purchase_order_id', $po->id);
            if ($data['action']==='reject') {
                $po->update(['approval_status'=>'rejected']);
                Notification::notifyUser($po->created_by, 'po_rejected', 'Purchase Order rejected', "PO {$po->po_number} was rejected.", ['purchase_order_id'=>$po->id,'path'=>"/purchase-order/{$po->id}"], true);
            }
            else {
                $values=['approval_status'=>$stage['next']];
                if ($stage['next']==='approved') $values['status']='issued';
                $po->update($values);
                if ($stage['next'] === 'pending_depot') {
                    Notification::notifyRole('depot_manager', 'po_approval_required', 'Purchase Order awaiting Depot approval', "PO {$po->po_number} requires your approval.", ['purchase_order_id'=>$po->id,'path'=>"/purchase-order/{$po->id}"], true);
                } elseif ($stage['next'] === 'pending_management') {
                    Notification::notifyRole('admin', 'po_approval_required', 'Purchase Order awaiting Management approval', "PO {$po->po_number} requires final approval.", ['purchase_order_id'=>$po->id,'path'=>"/purchase-order/{$po->id}"], true);
                } elseif ($stage['next'] === 'approved') {
                    Notification::notifyUser($po->created_by, 'po_approved', 'Purchase Order approved', "PO {$po->po_number} is approved and ready to dispatch.", ['purchase_order_id'=>$po->id,'path'=>"/purchase-order/{$po->id}"], true);
                }
            }
            return response()->json(['success'=>true,'data'=>$po->fresh(['approvals.approver:id,name,e_signature','selectedQuotation.supplier'])]);
        });
    }
}
