<?php

namespace App\Http\Controllers;

use App\Models\ProcurementBudgetPlan;
use App\Models\ProcurementQuotation;
use App\Models\ProcurementRejectedGood;
use App\Models\ProcurementSupplier;
use App\Models\ProcurementVendorEvaluation;
use App\Models\Prf;
use App\Models\IncomingGoodsInspection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use App\Services\ProcurementSopPolicy;

class ProcurementRegistryController extends Controller
{
    private const RATING_KEYS = ['c01','c02','c03','c04','c05','c06','c07','c08','c09','c10'];
    private const WEIGHTS = ['c01'=>15,'c02'=>15,'c03'=>10,'c04'=>10,'c05'=>5,'c06'=>10,'c07'=>5,'c08'=>10,'c09'=>5,'c10'=>15];

    private function canAccess(): bool
    {
        $user = auth()->user();
        return $user && ($user->isAdmin()
            || in_array($user->role, ['depot_manager', 'procurement', 'purchasing'], true)
            || $user->hasPermission('procurement.access'));
    }

    private function canManage(): bool
    {
        $user = auth()->user();
        return $user && ($user->isAdmin() || in_array($user->role, ['procurement', 'purchasing'], true));
    }

    public function suppliers(Request $request): JsonResponse
    {
        if (!$this->canAccess()) return response()->json(['message' => 'Forbidden'], 403);
        $q = ProcurementSupplier::with(['preparer:id,name,e_signature', 'evaluations.preparer:id,name,e_signature'])
            ->orderBy('company_name');
        if ($request->filled('status')) $q->where('status', $request->status);
        if ($request->filled('search')) {
            $search = $request->search;
            $q->where(fn ($x) => $x->where('company_name', 'like', "%{$search}%")
                ->orWhere('supplier_number', 'like', "%{$search}%")
                ->orWhere('specialties', 'like', "%{$search}%"));
        }
        return response()->json(['success' => true, 'data' => $q->get()]);
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message' => 'Only Procurement can assess suppliers'], 403);
        $v = Validator::make($request->all(), [
            'company_name' => 'required|string|max:255', 'company_address' => 'nullable|string|max:2000',
            'interface_person' => 'nullable|string|max:255', 'business_type' => 'nullable|string|max:255',
            'phone_email' => 'nullable|string|max:255', 'locations_count' => 'nullable|integer|min:0',
            'specialties' => 'nullable|string|max:2000', 'origin' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:100',
            'is_contractor' => 'nullable|boolean', 'ohs_instructions_acknowledged_at' => 'nullable|date',
            'ohs_acknowledgement_reference' => 'nullable|string|max:255',
            'valid_commercial_registration' => 'required|boolean', 'valid_tax_registration' => 'required|boolean',
            'technical_support_available' => 'required|boolean', 'timely_competitive_quotations' => 'required|boolean',
            'clear_payment_lead_time' => 'required|boolean', 'clear_warranty_terms' => 'required|boolean',
            'ehs_compliant' => 'required|boolean',
        ]);
        if ($v->fails()) return response()->json(['errors' => $v->errors()], 422);

        return DB::transaction(function () use ($v) {
            $data = $v->validated();
            $criteria = [
                'valid_commercial_registration','valid_tax_registration','technical_support_available',
                'timely_competitive_quotations','clear_payment_lead_time','clear_warranty_terms','ehs_compliant',
            ];
            $approved = collect($criteria)->every(fn ($key) => (bool) $data[$key]);
            if (!empty($data['is_contractor'])) {
                $approved = $approved && filled($data['ohs_instructions_acknowledged_at'] ?? null)
                    && filled($data['ohs_acknowledgement_reference'] ?? null);
            }
            $next = ((int) ProcurementSupplier::lockForUpdate()->max('id')) + 1;
            $supplier = ProcurementSupplier::create($data + [
                'supplier_number' => 'NSA-EG1-' . now()->format('Y') . '-' . str_pad((string) $next, 4, '0', STR_PAD_LEFT),
                'prepared_by' => auth()->id(), 'status' => $approved ? 'approved' : 'pending',
            ]);
            return response()->json(['success' => true, 'data' => $supplier->load('preparer:id,name,e_signature')], 201);
        });
    }

    public function updateSupplier(Request $request, ProcurementSupplier $supplier): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message' => 'Only Procurement can update suppliers'], 403);
        $allowed = $request->validate([
            'company_name' => 'sometimes|string|max:255', 'company_address' => 'nullable|string|max:2000',
            'interface_person' => 'nullable|string|max:255', 'business_type' => 'nullable|string|max:255',
            'phone_email' => 'nullable|string|max:255', 'locations_count' => 'nullable|integer|min:0',
            'specialties' => 'nullable|string|max:2000', 'origin' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:100', 'status' => 'nullable|in:pending,approved,re_evaluation,suspended',
            'is_contractor' => 'sometimes|boolean', 'ohs_instructions_acknowledged_at' => 'nullable|date',
            'ohs_acknowledgement_reference' => 'nullable|string|max:255',
            'valid_commercial_registration' => 'sometimes|boolean', 'valid_tax_registration' => 'sometimes|boolean',
            'technical_support_available' => 'sometimes|boolean', 'timely_competitive_quotations' => 'sometimes|boolean',
            'clear_payment_lead_time' => 'sometimes|boolean', 'clear_warranty_terms' => 'sometimes|boolean',
            'ehs_compliant' => 'sometimes|boolean', 'successful_deliveries' => 'sometimes|integer|min:0',
        ]);
        if (($allowed['status'] ?? null) === 'approved') {
            $candidate = array_merge($supplier->toArray(), $allowed);
            $criteria = [
                'valid_commercial_registration','valid_tax_registration','technical_support_available',
                'timely_competitive_quotations','clear_payment_lead_time','clear_warranty_terms','ehs_compliant',
            ];
            $eligible = collect($criteria)->every(fn ($key) => !empty($candidate[$key]));
            if (!empty($candidate['is_contractor'])) {
                $eligible = $eligible && filled($candidate['ohs_instructions_acknowledged_at'] ?? null)
                    && filled($candidate['ohs_acknowledgement_reference'] ?? null);
            }
            if (!$eligible) return response()->json(['message' => 'Supplier eligibility and contractor OH&S requirements must be complete before approval'], 422);
        }
        $supplier->update($allowed);
        return response()->json(['success' => true, 'data' => $supplier->fresh(['preparer:id,name,e_signature','evaluations'])]);
    }

    public function evaluateSupplier(Request $request, ProcurementSupplier $supplier): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message' => 'Only Procurement can evaluate suppliers'], 403);
        $rules = ['evaluation_date' => 'nullable|date', 'notes' => 'nullable|string|max:2000'];
        foreach (self::RATING_KEYS as $key) $rules["ratings.{$key}"] = 'required|integer|between:1,5';
        $data = $request->validate($rules);
        if ($supplier->successful_deliveries < 3) {
            return response()->json(['message' => 'Vendor evaluation starts after 3 successful deliveries'], 422);
        }
        if ($supplier->last_evaluated_at && $supplier->next_evaluation_at && $supplier->next_evaluation_at->isAfter(now()->addDays(7))) {
            return response()->json(['message' => 'The next vendor evaluation is not due yet'], 422);
        }
        $ratings = $data['ratings'];
        $total = array_sum($ratings);
        $percentage = 0;
        foreach (self::WEIGHTS as $key => $weight) $percentage += ($ratings[$key] / 5) * $weight;
        $percentage = round($percentage, 2);
        $previous = $supplier->evaluations()->first();
        // SOP: a weak result first triggers an improvement/re-evaluation cycle.
        // Suspension is only applied when a subsequent score is still below 65%.
        $outcome = ProcurementSopPolicy::vendorEvaluationOutcome($percentage, $previous?->percentage);

        return DB::transaction(function () use ($supplier, $data, $ratings, $total, $percentage, $outcome) {
            $next = ((int) ProcurementVendorEvaluation::lockForUpdate()->max('id')) + 1;
            $evaluation = ProcurementVendorEvaluation::create([
                'evaluation_number' => 'VE-EG1-' . now()->format('Y') . '-' . str_pad((string) $next, 4, '0', STR_PAD_LEFT),
                'supplier_id' => $supplier->id, 'evaluation_date' => $data['evaluation_date'] ?? now()->toDateString(),
                'ratings' => $ratings, 'grand_total' => $total, 'percentage' => $percentage,
                'outcome' => $outcome, 'notes' => $data['notes'] ?? null, 'prepared_by' => auth()->id(),
            ]);
            $needsImprovement = $outcome === 're_evaluation';
            $supplier->update([
                'latest_performance_percentage' => $percentage, 'status' => $outcome,
                'last_evaluated_at' => now(),
                'next_evaluation_at' => $needsImprovement ? now()->addDays(30) : now()->addMonths(6),
                'improvement_requested_at' => $needsImprovement ? now() : null,
                'improvement_due_at' => $needsImprovement ? now()->addDays(30) : null,
            ]);
            return response()->json(['success' => true, 'data' => $evaluation->load('preparer:id,name,e_signature')], 201);
        });
    }

    public function quotations(Request $request, Prf $prf): JsonResponse
    {
        if (!$this->canAccess()) return response()->json(['message' => 'Forbidden'], 403);
        return response()->json(['success' => true, 'data' => ProcurementQuotation::with('supplier')->where('prf_id', $prf->id)->get()]);
    }

    public function storeQuotation(Request $request, Prf $prf): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message' => 'Only Procurement can record quotations'], 403);
        $data = $request->validate([
            'supplier_id' => 'required|exists:procurement_suppliers,id', 'reference' => 'nullable|string|max:100',
            'requested_date' => 'nullable|date', 'received_date' => 'nullable|date', 'expiry_date' => 'nullable|date', 'incoterm' => 'nullable|string|max:255',
            'lead_time_days' => 'nullable|integer|min:0', 'price_before_vat' => 'required|numeric|min:0',
            'available_quantity' => 'nullable|numeric|min:0', 'minimum_order_quantity' => 'nullable|numeric|min:0',
            'vat' => 'nullable|numeric|min:0', 'technical_compliant' => 'required|boolean',
            'ehs_compliant' => 'required|boolean', 'selected' => 'nullable|boolean', 'notes' => 'nullable|string|max:2000',
            'supporting_documents' => 'nullable|string|max:5000',
        ]);
        $supplier = ProcurementSupplier::findOrFail($data['supplier_id']);
        if ($supplier->status !== 'approved') {
            return response()->json(['message' => 'Only approved vendors can be quoted'], 422);
        }
        if (!empty($data['selected'])) {
            if (!$data['technical_compliant'] || !$data['ehs_compliant']) {
                return response()->json(['message' => 'A non-compliant quotation cannot be selected'], 422);
            }
            if (!empty($data['expiry_date']) && $data['expiry_date'] < now()->toDateString()) {
                return response()->json(['message' => 'An expired quotation cannot be selected'], 422);
            }
        }
        return DB::transaction(function () use ($data, $prf) {
            if (!empty($data['selected'])) ProcurementQuotation::where('prf_id', $prf->id)->update(['selected' => false]);
            $quote = ProcurementQuotation::create($data + ['prf_id' => $prf->id, 'created_by' => auth()->id()]);
            return response()->json(['success' => true, 'data' => $quote->load('supplier')], 201);
        });
    }

    public function budgets(): JsonResponse
    {
        if (!$this->canAccess()) return response()->json(['message' => 'Forbidden'], 403);
        return response()->json(['success' => true, 'data' => ProcurementBudgetPlan::with(['preparer:id,name,e_signature','depotApprover:id,name,e_signature','managementApprover:id,name,e_signature'])->orderByDesc('year')->orderByDesc('month')->get()]);
    }

    public function storeBudget(Request $request): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message' => 'Only Procurement can prepare the budget'], 403);
        $data = $request->validate([
            'year' => 'required|integer|between:2020,2100', 'month' => 'required|integer|between:1,12',
            'items' => 'required|array|min:1', 'items.*.category' => 'required|string|max:100',
            'items.*.description' => 'required|string|max:500', 'items.*.delivery_term' => 'nullable|string|max:255',
            'items.*.stock' => 'nullable|numeric|min:0', 'items.*.average_usage' => 'nullable|numeric|min:0',
            'items.*.quantity' => 'required|numeric|min:0', 'items.*.unit' => 'nullable|string|max:50',
            'items.*.unit_price' => 'required|numeric|min:0', 'items.*.vat_rate' => 'nullable|numeric|min:0|max:100',
            'items.*.withholding_rate' => 'nullable|numeric|min:0|max:100', 'items.*.notes' => 'nullable|string|max:1000',
        ]);
        $subtotal = $vat = $withholding = 0;
        foreach ($data['items'] as &$item) {
            $line = round((float) $item['quantity'] * (float) $item['unit_price'], 2);
            $item['total'] = $line; $subtotal += $line;
            $vat += $line * ((float) ($item['vat_rate'] ?? 0) / 100);
            $withholding += $line * ((float) ($item['withholding_rate'] ?? 0) / 100);
        }
        unset($item);
        $existing = ProcurementBudgetPlan::where(['year'=>$data['year'],'month'=>$data['month']])->first();
        if ($existing?->status === 'approved') {
            return response()->json(['message'=>'An approved budget plan is locked and cannot be overwritten'], 422);
        }
        $plan = ProcurementBudgetPlan::updateOrCreate(['year'=>$data['year'],'month'=>$data['month']], [
            'items'=>$data['items'], 'subtotal'=>$subtotal, 'vat_total'=>round($vat,2),
            'withholding_total'=>round($withholding,2), 'grand_total'=>round($subtotal+$vat-$withholding,2),
            'status'=>'pending_depot', 'prepared_by'=>auth()->id(), 'rejection_reason'=>null,
        ]);
        return response()->json(['success' => true, 'data' => $plan->load('preparer:id,name,e_signature')], 201);
    }

    public function approveBudget(Request $request, ProcurementBudgetPlan $budget): JsonResponse
    {
        $user = auth()->user();
        $action = $request->validate(['action'=>'required|in:approve,reject','reason'=>'nullable|string|max:1000']);
        if ($budget->status === 'pending_depot' && ($user->isAdmin() || $user->role === 'depot_manager')) {
            $budget->update($action['action'] === 'approve'
                ? ['status'=>'pending_management','depot_approved_by'=>$user->id,'depot_approved_at'=>now()]
                : ['status'=>'rejected','rejection_reason'=>$action['reason'] ?? null]);
        } elseif ($budget->status === 'pending_management' && $user->isAdmin()) {
            $budget->update($action['action'] === 'approve'
                ? ['status'=>'approved','management_approved_by'=>$user->id,'management_approved_at'=>now()]
                : ['status'=>'rejected','rejection_reason'=>$action['reason'] ?? null]);
        } else return response()->json(['message'=>'You cannot act on this budget stage'], 403);
        return response()->json(['success'=>true,'data'=>$budget->fresh()]);
    }

    public function rejectedGoods(): JsonResponse
    {
        if (!$this->canAccess()) return response()->json(['message'=>'Forbidden'], 403);
        return response()->json(['success'=>true,'data'=>ProcurementRejectedGood::with(['igi.po:id,po_number','requester:id,name,e_signature','materialController:id,name,e_signature'])->latest()->get()]);
    }

    public function storeRejectedGood(Request $request): JsonResponse
    {
        $data = $request->validate([
            'igi_id'=>'required|exists:incoming_goods_inspections,id','delivery_date'=>'nullable|date',
            'item_description'=>'required|string|max:500','part_number'=>'nullable|string|max:100',
            'quantity_affected'=>'required|numeric|min:0.001','rejecting_date'=>'nullable|date','reason'=>'required|string|max:5000',
        ]);
        $igi = IncomingGoodsInspection::with('po.prf')->findOrFail($data['igi_id']);
        $user = auth()->user();
        $isRequester = $igi->po?->prf?->requested_by === $user->id;
        if (!$this->canManage() && !$isRequester) {
            return response()->json(['message'=>'Only the requester or Procurement can create the rejected goods form'], 403);
        }
        $next = ((int) ProcurementRejectedGood::max('id')) + 1;
        return DB::transaction(function () use ($data, $next) {
            $row = ProcurementRejectedGood::create($data + [
                'rejection_number'=>'RGF-EG1-'.now()->format('Y').'-'.str_pad((string)$next,4,'0',STR_PAD_LEFT),
                'rejecting_date'=>$data['rejecting_date'] ?? now()->toDateString(), 'requester_id'=>auth()->id(),
            ]);
            IncomingGoodsInspection::whereKey($data['igi_id'])->update([
                'status' => 'rejected',
                'approval_status' => 'rejected',
            ]);
            return response()->json(['success'=>true,'data'=>$row],201);
        });
    }

    public function updateRejectedGood(Request $request, ProcurementRejectedGood $rejectedGood): JsonResponse
    {
        if (!$this->canManage()) return response()->json(['message'=>'Only Procurement can update rejected goods'],403);
        $data=$request->validate(['status'=>'required|in:pending_return,supplier_acknowledged,returned,closed','material_controller_id'=>'nullable|exists:users,id']);
        if ($data['status']==='supplier_acknowledged') $data['supplier_acknowledged_at']=now();
        if (in_array($data['status'],['returned','closed'],true)) $data['returned_at']=now();
        $rejectedGood->update($data);
        return response()->json(['success'=>true,'data'=>$rejectedGood->fresh()]);
    }

    public function controlLog(): JsonResponse
    {
        if (!$this->canAccess()) return response()->json(['message'=>'Forbidden'],403);
        $rows = Prf::with(['requester:id,name','items','purchaseOrder.items','purchaseOrder.igi:id,po_id,igi_number,status,date'])
            ->latest()->get()->map(function ($prf) {
                $po=$prf->purchaseOrder;
                return [
                    'prf_id'=>$prf->id,'prf_number'=>$prf->prf_number,'requester'=>$prf->requester?->name,
                    'prf_date'=>$prf->date,'prf_status'=>$prf->status,'required_by_date'=>$prf->items->max('required_by_date'),
                    'po_id'=>$po?->id,'po_number'=>$po?->po_number,'supplier'=>$po?->vendor,'po_date'=>$po?->date,
                    'po_status'=>$po?->status,'approval_status'=>$po?->approval_status,
                    'dispatched_at'=>$po?->dispatched_at,'dispatched_to'=>$po?->dispatched_to,
                    'dispatch_reference'=>$po?->dispatch_reference,'payment_status'=>$po?->payment_status,
                    'payment_method'=>$po?->payment_method,'payment_reference'=>$po?->payment_reference,
                    'paid_at'=>$po?->paid_at,
                    'delivery_date'=>$po?->igi?->date,'igi_number'=>$po?->igi?->igi_number,'igi_status'=>$po?->igi?->status,
                    'delivered_items'=>$po?->items?->map(fn ($item) => [
                        'description'=>$item->item_description,'quantity'=>$item->qty,'unit'=>$item->unit,
                    ])->values(),
                ];
            });
        return response()->json(['success'=>true,'data'=>$rows]);
    }
}
