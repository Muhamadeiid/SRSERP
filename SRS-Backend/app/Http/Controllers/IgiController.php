<?php

namespace App\Http\Controllers;

use App\Models\IgiItem;
use App\Models\IncomingGoodsInspection;
use App\Models\PurchaseOrder;
use App\Models\ProcurementSupplier;
use App\Models\IncomingGoodsInspectionApproval;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class IgiController extends Controller
{
    private function canAccess($user): bool
    {
        return $user->isAdmin()
            || in_array($user->role, ['depot_manager', 'procurement', 'purchasing'], true);
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
            'approvals.approver:id,name,role,department,e_signature',
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
        $igi->loadMissing('po.prf');
        $isRequester = $igi->po?->prf?->requested_by === $user->id;
        $department = strtolower((string) $user->department);
        $isInspector = in_array($user->role, ['ehs','store_staff'], true)
            || str_contains($department, 'quality') || $department === 'qc'
            || str_contains($department, 'inventory') || str_contains($department, 'store');
        if (!$this->canAccess($user) && !$isRequester && !$isInspector) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $igi->load([
            'creator:id,name,role',
            'po:id,po_number,prf_id,vendor,date,status',
            'po.prf:id,prf_number,requested_by',
            'po.prf.requester:id,name',
            'items',
            'approvals.approver:id,name,role,department,e_signature',
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
                'approval_status' => 'draft',
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
                'approvals.approver:id,name,role,department,e_signature',
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
            $wasApproved = $igi->status === 'approved';
            $igi->update(array_filter([
                'date'            => $data['date']            ?? null,
                'supplier_name'   => $data['supplier_name']   ?? null,
                'delivery_note_no'=> $data['delivery_note_no']?? null,
                'photos_notes'    => $data['photos_notes']    ?? null,
                'photos'          => $data['photos']          ?? null,
                'status'          => $data['status']          ?? null,
            ], fn($v) => $v !== null));

            // A compliant completed delivery counts toward the supplier's first
            // formal evaluation, which the SOP starts after 3 successful deliveries.
            if (!$wasApproved && $igi->status === 'approved') {
                $selectedQuotationId = PurchaseOrder::whereKey($igi->po_id)->value('selected_quotation_id');
                if ($selectedQuotationId) {
                    $actualSupplierId = \App\Models\ProcurementQuotation::whereKey($selectedQuotationId)->value('supplier_id');
                    if ($actualSupplierId) ProcurementSupplier::whereKey($actualSupplierId)->increment('successful_deliveries');
                }
            }

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
                'approvals.approver:id,name,role,department,e_signature',
            ]);

            return response()->json(['success' => true, 'data' => $igi]);
        });
    }

    public function submitForApproval(IncomingGoodsInspection $igi): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canAccess($user)) return response()->json(['message'=>'Forbidden'],403);
        if (!in_array($igi->approval_status, ['draft','rejected'], true)) return response()->json(['message'=>'IGI is already in approval'],422);
        $igi->update(['status'=>'submitted','approval_status'=>'pending_requester']);
        return response()->json(['success'=>true,'data'=>$igi->fresh(['approvals.approver'])]);
    }

    public function decide(Request $request, IncomingGoodsInspection $igi): JsonResponse
    {
        $user=auth()->user();
        $data=$request->validate(['action'=>'required|in:approve,reject','comment'=>'nullable|string|max:2000']);
        $igi->loadMissing('po.prf');
        $department=strtolower((string)$user->department);
        $stages=[
            'pending_requester'=>['stage'=>'requester','next'=>'pending_inventory','allowed'=>$user->isAdmin() || $igi->po?->prf?->requested_by===$user->id],
            'pending_inventory'=>['stage'=>'inventory','next'=>'pending_ehs','allowed'=>$user->isAdmin() || $user->role==='store_staff' || str_contains($department,'inventory') || str_contains($department,'store')],
            'pending_ehs'=>['stage'=>'ehs','next'=>'pending_quality','allowed'=>$user->isAdmin() || $user->role==='ehs'],
            'pending_quality'=>['stage'=>'quality_control','next'=>'pending_procurement','allowed'=>$user->isAdmin() || str_contains($department,'quality') || $department==='qc'],
            'pending_procurement'=>['stage'=>'procurement','next'=>'pending_management','allowed'=>$user->isAdmin() || in_array($user->role,['procurement','purchasing'],true)],
            'pending_management'=>['stage'=>'management','next'=>'approved','allowed'=>$user->isAdmin() || $user->role==='depot_manager'],
        ];
        $stage=$stages[$igi->approval_status]??null;
        if(!$stage) return response()->json(['message'=>'IGI is not awaiting approval'],422);
        if(!$stage['allowed']) return response()->json(['message'=>'You cannot approve this IGI stage'],403);
        return DB::transaction(function() use($igi,$user,$data,$stage){
            IncomingGoodsInspectionApproval::create(['igi_id'=>$igi->id,'stage'=>$stage['stage'],'action'=>$data['action'],'approver_id'=>$user->id,'comment'=>$data['comment']??null,'acted_at'=>now()]);
            if($data['action']==='reject') $igi->update(['status'=>'rejected','approval_status'=>'rejected']);
            else {
                $values=['approval_status'=>$stage['next']];
                if($stage['next']==='approved') $values['status']='approved';
                $igi->update($values);
                if($stage['next']==='approved') $this->incrementSupplierDelivery($igi);
            }
            return response()->json(['success'=>true,'data'=>$igi->fresh(['creator:id,name,role','po.prf.requester:id,name,e_signature','items','approvals.approver:id,name,role,department,e_signature'])]);
        });
    }

    private function incrementSupplierDelivery(IncomingGoodsInspection $igi): void
    {
        $selectedQuotationId = PurchaseOrder::whereKey($igi->po_id)->value('selected_quotation_id');
        if (!$selectedQuotationId) return;
        $supplierId = \App\Models\ProcurementQuotation::whereKey($selectedQuotationId)->value('supplier_id');
        if ($supplierId) ProcurementSupplier::whereKey($supplierId)->increment('successful_deliveries');
    }
}
