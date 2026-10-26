<?php

namespace App\Http\Controllers;

use App\Mail\PrfApprovalRequested;
use App\Models\Notification;
use App\Models\Prf;
use App\Models\PrfApproval;
use App\Models\PrfActivity;
use App\Models\PrfItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class PrfController extends Controller
{
    private const MATERIAL_CATEGORIES = [
        'Components and Parts',
        'Safety Equipment',
        'Consumables',
        'Office Supply / Furniture',
        'Tools and Equipment',
        'IT Equipment',
        'Electronics',
        'Others',
    ];

    // ── Stage configuration (sequential pipeline) ───────────────
    // 'role' stays for notifications (who to email). 'permission' is the actual
    // authority check, so approval rights are managed from the Permission Matrix.
    private const PIPELINE = [
        'pending_material'    => ['role' => 'material_controller', 'permission' => 'prf.approve_material',    'next' => 'pending_procurement', 'label' => 'Material Controller'],
        'pending_procurement' => ['role' => 'procurement',   'permission' => 'prf.approve_procurement', 'next' => 'pending_ehs',    'label' => 'Procurement'],
        'pending_ehs'         => ['role' => 'ehs_manager',   'permission' => 'prf.approve_ehs',         'next' => 'pending_depot',  'label' => 'EHS Manager'],
        'pending_depot'       => ['role' => 'depot_manager', 'permission' => 'prf.approve_depot',       'next' => 'approved',       'label' => 'Depot Manager'],
    ];

    // Notes attachment: a base64 raster-image data URI only. The UI caps uploads
    // at 2 MB, which is about 2.8 MB once base64-encoded.
    private const NOTES_IMAGE_RULE = [
        'nullable', 'string', 'max:2900000',
        'regex:/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=\s]+$/',
    ];

    // ─────────────────────────────────────────────────────────────
    //  LIST
    // ─────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();

        // List views never need e-signatures or the notes attachment; those are
        // returned only by show() for the single PRF being opened or printed.
        $query = Prf::with([
            'requester:id,name,email,role',
            'items',
            'approvals.approver:id,name,role',
        ]);
        $forList = fn ($prfs) => $prfs->each->makeHidden('notes_image');

        if ($request->boolean('mine')) {
            $query->where('requested_by', $user->id);
        }

        // Visibility rules
        if ($request->boolean('mine')) {
            // Explicit personal view always shows the signed-in user's requests only.
        } elseif ($user->isAdmin()) {
            // full visibility
        } elseif (
            in_array($user->role, ['material_controller', 'procurement', 'purchasing', 'ehs', 'ehs_manager', 'depot_manager'], true)
            || $user->hasPermission('prf.approve_material')
            || $user->hasPermission('prf.approve_procurement')
            || $user->hasPermission('prf.approve_ehs')
            || $user->hasPermission('prf.approve_depot')
        ) {
            // approvers see everything
        } else {
            // requester sees own only
            $query->where('requested_by', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        $query->orderByDesc('created_at');

        if ($request->filled('per_page')) {
            $perPage = min(200, max(1, (int) $request->per_page));
            $page    = max(1, (int) $request->input('page', 1));
            $p = $query->paginate($perPage, ['*'], 'page', $page);
            $forList($p->getCollection());
            return response()->json([
                'success'    => true,
                'data'       => $p->items(),
                'pagination' => [
                    'current_page' => $p->currentPage(),
                    'last_page'    => $p->lastPage(),
                    'per_page'     => $p->perPage(),
                    'total'        => $p->total(),
                ],
            ]);
        }

        return response()->json(['success' => true, 'data' => $forList($query->get())]);
    }

    // ─────────────────────────────────────────────────────────────
    //  SHOW
    // ─────────────────────────────────────────────────────────────
    public function show(Prf $prf): JsonResponse
    {
        $user = auth()->user();
        $canViewAll = $user->isAdmin()
            || in_array($user->role, ['material_controller', 'procurement', 'purchasing', 'ehs', 'ehs_manager', 'depot_manager'], true)
            || $user->hasPermission('procurement.access')
            || $user->hasPermission('prf.approve_material')
            || $user->hasPermission('prf.approve_procurement')
            || $user->hasPermission('prf.approve_ehs')
            || $user->hasPermission('prf.approve_depot');
        if (!$canViewAll && $prf->requested_by !== $user->id) {
            return response()->json(['success' => false, 'message' => 'You cannot view this purchase request'], 403);
        }

        $prf->load([
            'requester:id,name,email,role,e_signature',
            'items',
            'approvals.approver:id,name,e_signature,role',
            'purchaseOrder:id,prf_id,po_number,status',
            'activities.actor:id,name,role',
        ]);

        // A signature can be saved on the user account (by its owner) or on the
        // linked employee record (by HR). Fall back to the employee record so the
        // printed form shows the e-signature instead of just the name.
        $signedApprovers = $prf->approvals
            ->where('role', '!=', 'material_controller')
            ->pluck('approver');
        $people = collect([$prf->requester])->merge($signedApprovers)->filter();
        $missing = $people->filter(fn ($person) => empty($person->e_signature))->pluck('id')->unique();
        if ($missing->isNotEmpty()) {
            $employeeSignatures = \App\Models\Employee::whereIn('user_id', $missing)
                ->whereNotNull('e_signature')
                ->where('e_signature', '!=', '')
                ->pluck('e_signature', 'user_id');
            $people->each(function ($person) use ($employeeSignatures) {
                if (empty($person->e_signature) && isset($employeeSignatures[$person->id])) {
                    $person->setAttribute('e_signature', $employeeSignatures[$person->id]);
                }
            });
        }

        // Material Controller approval is an audit decision only. It must never
        // attach or expose an e-signature in the PRF approval flow.
        $prf->approvals
            ->where('role', 'material_controller')
            ->each(fn ($approval) => $approval->approver?->setAttribute('e_signature', null));

        return response()->json(['success' => true, 'data' => $prf]);
    }

    // ─────────────────────────────────────────────────────────────
    //  STORE
    // ─────────────────────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'prf_number'                    => 'nullable|string|max:64|unique:prfs,prf_number',
            'date'                          => 'nullable|date',
            'delivery_location'             => 'nullable|in:Ganz depot,Tura workshop,Kozzika,Katamya',
            'delivery_contact'              => 'nullable|string|max:255',
            'requester_phone'               => 'nullable|string|max:50',
            'requester_email'               => 'nullable|email|max:255',
            'material_category'             => 'required|array|min:1',
            'material_category.*'           => ['required', 'string', Rule::in(self::MATERIAL_CATEGORIES)],
            'notes'                         => 'nullable|string|max:2000',
            'notes_image'                   => self::NOTES_IMAGE_RULE,
            'items'                         => 'required|array|min:1',
            'items.*.description'           => 'required|string|max:500',
            'items.*.technical_specifications' => 'nullable|string|max:2000',
            'items.*.quantity'              => 'required|numeric|min:0.01',
            'items.*.unit'                  => 'nullable|string|max:50',
            'items.*.ehs_requirements'      => 'nullable|in:SDS,No EHS Required',
            'items.*.required_by_date'      => 'nullable|date',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();
        $user = auth()->user();

        if (filled($data['prf_number'] ?? null)) {
            abort_unless($this->canNumberRequests($user), 403, 'Only Procurement can assign a tracking number');
            $data['prf_number'] = $this->normalizeTrackingNumber($data['prf_number'], (int) (isset($data['date']) ? date('Y', strtotime($data['date'])) : now()->year));
            if (Prf::where('prf_number', $data['prf_number'])->exists()) {
                return response()->json(['message' => 'This PRF number is already in use'], 422);
            }
        }

        return DB::transaction(function () use ($data, $user) {
            $prf = Prf::create([
                'prf_number'        => filled($data['prf_number'] ?? null) ? $data['prf_number'] : Prf::generateNumber(),
                'requested_by'      => $user->id,
                'date'              => $data['date']              ?? now()->toDateString(),
                'delivery_location' => $data['delivery_location'] ?? null,
                'delivery_contact'  => $data['delivery_contact']  ?? null,
                'requester_phone'   => $data['requester_phone']   ?? $user->mobile_number,
                'requester_email'   => $data['requester_email']   ?? $user->company_email,
                'material_category' => $data['material_category'] ?? [],
                'notes'             => $data['notes']             ?? null,
                'notes_image'       => $data['notes_image']       ?? null,
                'status'            => 'pending_material',
            ]);

            foreach ($data['items'] as $i => $row) {
                PrfItem::create([
                    'prf_id'                   => $prf->id,
                    'sn'                       => $i + 1,
                    'description'              => $row['description'],
                    'technical_specifications' => $row['technical_specifications'] ?? null,
                    'quantity'                 => $row['quantity'],
                    'unit'                     => $row['unit'] ?? 'pcs',
                    'ehs_requirements'         => $row['ehs_requirements'] ?? null,
                    'required_by_date'         => $row['required_by_date'] ?? null,
                ]);
            }

            $this->notifyStageApprovers($prf, 'pending_material');
            $this->notifyFutureStageApprovers($prf);

            return response()->json([
                'success' => true,
                'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
            ], 201);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE / CANCEL — requester or Material Controller before first approval
    // ─────────────────────────────────────────────────────────────
    public function update(Request $request, Prf $prf): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'date'                          => 'nullable|date',
            'delivery_location'             => 'nullable|in:Ganz depot,Tura workshop,Kozzika,Katamya',
            'delivery_contact'              => 'nullable|string|max:255',
            'requester_phone'               => 'nullable|string|max:50',
            'requester_email'               => 'nullable|email|max:255',
            'material_category'             => 'required|array|min:1',
            'material_category.*'           => ['required', 'string', Rule::in(self::MATERIAL_CATEGORIES)],
            'notes'                         => 'nullable|string|max:2000',
            'notes_image'                   => self::NOTES_IMAGE_RULE,
            'items'                         => 'required|array|min:1',
            'items.*.description'           => 'required|string|max:500',
            'items.*.technical_specifications' => 'nullable|string|max:2000',
            'items.*.quantity'              => 'required|numeric|min:0.01',
            'items.*.unit'                  => 'nullable|string|max:50',
            'items.*.ehs_requirements'      => 'nullable|in:SDS,No EHS Required',
            'items.*.required_by_date'      => 'nullable|date',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        return DB::transaction(function () use ($prf, $v) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            $user = auth()->user();
            if (!$this->userCanModify($user, $lockedPrf)) {
                return response()->json([
                    'success' => false,
                    'message' => 'This purchase request can no longer be edited',
                ], 403);
            }

            $data = $v->validated();
            $before = $this->prfSnapshot($lockedPrf);
            $lockedPrf->update([
                'date'              => $data['date'] ?? $lockedPrf->date,
                'delivery_location' => $data['delivery_location'] ?? null,
                'delivery_contact'  => $data['delivery_contact'] ?? null,
                'requester_phone'   => $data['requester_phone'] ?? null,
                'requester_email'   => $data['requester_email'] ?? auth()->user()->company_email,
                'material_category' => $data['material_category'] ?? [],
                'notes'             => $data['notes'] ?? null,
                'notes_image'       => $data['notes_image'] ?? null,
            ]);

            $lockedPrf->items()->delete();
            foreach ($data['items'] as $i => $row) {
                PrfItem::create([
                    'prf_id'                   => $lockedPrf->id,
                    'sn'                       => $i + 1,
                    'description'              => $row['description'],
                    'technical_specifications' => $row['technical_specifications'] ?? null,
                    'quantity'                 => $row['quantity'],
                    'unit'                     => $row['unit'] ?? 'pcs',
                    'ehs_requirements'         => $row['ehs_requirements'] ?? null,
                    'required_by_date'         => $row['required_by_date'] ?? null,
                ]);
            }

            $lockedPrf->refresh()->load('items');
            $changes = $this->describePrfChanges($before, $this->prfSnapshot($lockedPrf));
            if ($changes !== []) {
                PrfActivity::create([
                    'prf_id' => $lockedPrf->id,
                    'actor_id' => $user->id,
                    'action' => 'updated',
                    'changes' => $changes,
                ]);
                if ($lockedPrf->requested_by !== $user->id) {
                    Notification::notifyUser(
                        $lockedPrf->requested_by,
                        'prf_updated',
                        "PRF Updated — {$lockedPrf->prf_number}",
                        "{$user->name} updated your purchase request. Open it to review the changes.",
                        ['prf_id' => $lockedPrf->id, 'path' => "/purchase-request/{$lockedPrf->id}"],
                        true
                    );
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Purchase request updated',
                'data' => $lockedPrf->fresh(['requester', 'items', 'approvals.approver', 'activities.actor']),
            ]);
        });
    }

    public function updateEhsRequirements(Request $request, Prf $prf): JsonResponse
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer'],
            'items.*.ehs_requirements' => ['required', Rule::in(['SDS', 'No EHS Required'])],
        ]);

        return DB::transaction(function () use ($prf, $validated) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            $user = auth()->user();
            $canEditSafety = $lockedPrf->status === 'pending_ehs'
                && ($user->isAdmin() || $user->hasPermission('prf.approve_ehs'));

            if (!$canEditSafety) {
                return response()->json([
                    'success' => false,
                    'message' => 'Safety requirements can only be edited by EHS during the EHS review stage',
                ], 403);
            }

            $before = $this->prfSnapshot($lockedPrf);
            $items = $lockedPrf->items()->lockForUpdate()->get()->keyBy('id');
            foreach ($validated['items'] as $row) {
                $item = $items->get($row['id']);
                if (!$item) {
                    return response()->json([
                        'success' => false,
                        'message' => 'One or more items do not belong to this purchase request',
                    ], 422);
                }
                $item->update(['ehs_requirements' => $row['ehs_requirements']]);
            }

            $lockedPrf->refresh()->load('items');
            $changes = $this->describePrfChanges($before, $this->prfSnapshot($lockedPrf));
            if ($changes !== []) {
                PrfActivity::create([
                    'prf_id' => $lockedPrf->id,
                    'actor_id' => $user->id,
                    'action' => 'safety_updated',
                    'changes' => $changes,
                ]);
                if ($lockedPrf->requested_by !== $user->id) {
                    Notification::notifyUser(
                        $lockedPrf->requested_by,
                        'prf_updated',
                        "PRF Safety Updated — {$lockedPrf->prf_number}",
                        "{$user->name} updated the safety requirements on your purchase request.",
                        ['prf_id' => $lockedPrf->id, 'path' => "/purchase-request/{$lockedPrf->id}"],
                        true
                    );
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Safety requirements updated',
                'data' => $lockedPrf->fresh(['requester', 'items', 'approvals.approver', 'activities.actor']),
            ]);
        });
    }

    public function destroy(Prf $prf): JsonResponse
    {
        $user = auth()->user();
        if (!$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Only Admin can delete an approved PRF'], 403);
        }

        return DB::transaction(function () use ($prf, $user) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            if ($lockedPrf->status !== 'approved') {
                return response()->json(['success' => false, 'message' => 'Only a fully approved PRF can be deleted'], 422);
            }
            if ($lockedPrf->purchaseOrder()->exists()) {
                return response()->json(['success' => false, 'message' => 'This PRF is linked to a PO and cannot be deleted'], 422);
            }

            $releasedNumber = $lockedPrf->prf_number;
            $lockedPrf->update([
                'deleted_prf_number' => $releasedNumber,
                'deleted_by' => $user->id,
                'prf_number' => "DELETED-{$lockedPrf->id}-{$releasedNumber}",
            ]);
            $lockedPrf->delete();
            $this->closePrfTrackingGap($releasedNumber, $lockedPrf->id);
            Notification::resolveFor('prf_id', $lockedPrf->id);

            return response()->json(['success' => true, 'message' => 'Purchase request deleted and tracking numbers reordered']);
        });
    }

    public function cancel(Prf $prf): JsonResponse
    {
        return DB::transaction(function () use ($prf) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            if (!$this->requesterCanModify($lockedPrf)) {
                return response()->json([
                    'success' => false,
                    'message' => 'This purchase request can no longer be cancelled',
                ], 403);
            }

            $voidNumber = str_ends_with($lockedPrf->prf_number, '-VOID')
                ? $lockedPrf->prf_number
                : $lockedPrf->prf_number . '-VOID';
            $lockedPrf->update(['status' => 'cancelled', 'prf_number' => $voidNumber]);
            $this->closePrfTrackingGap($lockedPrf->prf_number, $lockedPrf->id);
            Notification::resolveFor('prf_id', $lockedPrf->id);

            return response()->json([
                'success' => true,
                'message' => 'Purchase request cancelled',
                'data' => $lockedPrf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  APPROVE
    // ─────────────────────────────────────────────────────────────
    public function approve(Request $request, Prf $prf): JsonResponse
    {
        $user = auth()->user();

        $v = Validator::make($request->all(), [
            'comment' => 'nullable|string|max:1000',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        return DB::transaction(function () use ($prf, $user, $request) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            $stage = self::PIPELINE[$lockedPrf->status] ?? null;

            if (!$stage) {
                return response()->json([
                    'success' => false,
                    'message' => 'This PRF is not awaiting approval',
                ], 422);
            }

            if (!$this->userCanActInStage($user, $stage)) {
                return response()->json([
                    'success' => false,
                    'message' => "Only {$stage['label']} can approve at this stage",
                ], 403);
            }

            PrfApproval::create([
                'prf_id'      => $lockedPrf->id,
                'role'        => $stage['role'],
                'action'      => 'approved',
                'approver_id' => $user->id,
                'comment'     => $request->input('comment'),
                'acted_at'    => now(),
            ]);

            $lockedPrf->update(['status' => $stage['next']]);

            // Clear this stage's "awaiting approval" alerts, then hand over.
            Notification::resolveFor('prf_id', $lockedPrf->id);
            if ($stage['next'] === 'approved') {
                $this->notifyRequesterFinalApproved($lockedPrf, $user);
            } else {
                $this->notifyStageApprovers($lockedPrf, $stage['next']);
            }

            return response()->json([
                'success' => true,
                'message' => 'Approved',
                'data'    => $lockedPrf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  REJECT
    // ─────────────────────────────────────────────────────────────
    public function reject(Request $request, Prf $prf): JsonResponse
    {
        $user = auth()->user();

        $v = Validator::make($request->all(), [
            'comment' => 'required|string|max:1000',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        return DB::transaction(function () use ($prf, $user, $request) {
            $lockedPrf = Prf::query()->lockForUpdate()->findOrFail($prf->id);
            $stage = self::PIPELINE[$lockedPrf->status] ?? null;

            if (!$stage) {
                return response()->json([
                    'success' => false,
                    'message' => 'This PRF cannot be rejected at its current state',
                ], 422);
            }

            if (!$this->userCanActInStage($user, $stage)) {
                return response()->json([
                    'success' => false,
                    'message' => "Only {$stage['label']} can reject at this stage",
                ], 403);
            }

            PrfApproval::create([
                'prf_id'      => $lockedPrf->id,
                'role'        => $stage['role'],
                'action'      => 'rejected',
                'approver_id' => $user->id,
                'comment'     => $request->input('comment'),
                'acted_at'    => now(),
            ]);

            // Void the number so the next PRF can reuse it
            $originalNumber = $lockedPrf->prf_number;
            $voidNumber     = str_ends_with($originalNumber, '-VOID') ? $originalNumber : $originalNumber . '-VOID';

            $lockedPrf->update(['status' => 'rejected', 'prf_number' => $voidNumber]);
            $this->closePrfTrackingGap($originalNumber, $lockedPrf->id);

            Notification::resolveFor('prf_id', $lockedPrf->id);
            if ($lockedPrf->requested_by) {
                Notification::notifyUser(
                    $lockedPrf->requested_by,
                    'prf_rejected',
                    "PRF Rejected — {$originalNumber}",
                    "Your PRF was rejected by {$user->name} ({$stage['label']}): {$request->input('comment')}",
                    ['prf_id' => $lockedPrf->id],
                    true
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Rejected',
                'data'    => $lockedPrf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE TRACKING NO  (procurement / admin only)
    // ─────────────────────────────────────────────────────────────
    public function updateTrackingNo(Request $request, Prf $prf): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canNumberRequests($user)) {
            return response()->json(['success' => false, 'message' => 'Only Procurement can edit the tracking number'], 403);
        }

        $v = Validator::make($request->all(), [
            'prf_number' => 'required|string|max:64',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $year = (int) ($prf->date?->format('Y') ?: now()->year);
        $input = $this->normalizeTrackingNumber((string) $request->input('prf_number'), $year);

        if (Prf::where('prf_number', $input)->where('id', '!=', $prf->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'This PRF number is already in use'], 422);
        }

        $prf->update(['prf_number' => $input]);

        return response()->json(['success' => true, 'message' => 'PRF number updated', 'data' => $prf->fresh(['requester', 'items', 'approvals.approver'])]);
    }

    private function canNumberRequests(User $user): bool
    {
        return $user->isAdmin() || in_array($user->role, ['depot_manager', 'procurement', 'purchasing'], true);
    }

    private function normalizeTrackingNumber(string $input, int $year): string
    {
        $input = trim($input);
        if (ctype_digit($input)) {
            $input = "PRF-EG1-{$year}-" . str_pad($input, 4, '0', STR_PAD_LEFT);
        } elseif (preg_match('/^PRF-EG1-(\d{4})-(\d+)$/i', $input, $matches)) {
            $input = 'PRF-EG1-' . $matches[1] . '-' . str_pad($matches[2], 4, '0', STR_PAD_LEFT);
        } else {
            throw \Illuminate\Validation\ValidationException::withMessages(['prf_number' => 'Enter a sequence number such as 123 or a full PRF number']);
        }

        return $input;
    }

    // ─────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────
    private function userCanActInStage(User $user, array $stage): bool
    {
        if ($user->isAdmin()) return true;
        return !empty($stage['permission']) && $user->hasPermission($stage['permission']);
    }

    private function requesterCanModify(Prf $prf): bool
    {
        return $prf->requested_by === auth()->id()
            && $prf->status === 'pending_material'
            && !$prf->approvals()->exists();
    }

    private function userCanModify(User $user, Prf $prf): bool
    {
        if ($this->requesterCanModify($prf)) {
            return true;
        }

        if ($user->isAdmin()) {
            return in_array($prf->status, ['pending_material', 'pending_procurement', 'pending_ehs', 'pending_depot'], true);
        }

        return match ($prf->status) {
            'pending_material' => $user->hasPermission('prf.approve_material'),
            'pending_procurement' => $user->hasPermission('prf.approve_procurement'),
            'pending_depot' => $user->hasPermission('prf.approve_depot'),
            default => false,
        };
    }

    private function prfSnapshot(Prf $prf): array
    {
        $prf->loadMissing('items');

        return [
            'date' => optional($prf->date)->format('Y-m-d'),
            'delivery_location' => $prf->delivery_location,
            'delivery_contact' => $prf->delivery_contact,
            'requester_phone' => $prf->requester_phone,
            'requester_email' => $prf->requester_email,
            'material_category' => $prf->material_category ?? [],
            'notes' => $prf->notes,
            'items' => $prf->items->map(fn (PrfItem $item) => [
                'description' => $item->description,
                'quantity' => (float) $item->quantity,
                'unit' => $item->unit,
                'technical_specifications' => $item->technical_specifications,
                'ehs_requirements' => $item->ehs_requirements,
                'required_by_date' => optional($item->required_by_date)->format('Y-m-d'),
            ])->values()->all(),
        ];
    }

    private function describePrfChanges(array $before, array $after): array
    {
        $changes = [];
        foreach (['date', 'delivery_location', 'delivery_contact', 'requester_phone', 'requester_email', 'material_category', 'notes'] as $field) {
            if (($before[$field] ?? null) !== ($after[$field] ?? null)) {
                $changes['fields'][$field] = ['from' => $before[$field] ?? null, 'to' => $after[$field] ?? null];
            }
        }

        $beforeItems = collect($before['items'] ?? []);
        $afterItems = collect($after['items'] ?? []);
        $removed = $beforeItems->filter(fn ($item) => !$afterItems->contains(fn ($new) => $new['description'] === $item['description']))->values();
        $added = $afterItems->filter(fn ($item) => !$beforeItems->contains(fn ($old) => $old['description'] === $item['description']))->values();
        $quantityChanges = $afterItems->map(function ($item) use ($beforeItems) {
            $old = $beforeItems->firstWhere('description', $item['description']);
            if (!$old || (float) $old['quantity'] === (float) $item['quantity']) return null;
            return ['description' => $item['description'], 'from' => $old['quantity'], 'to' => $item['quantity']];
        })->filter()->values();
        $itemDetailChanges = $afterItems->map(function ($item) use ($beforeItems) {
            $old = $beforeItems->firstWhere('description', $item['description']);
            if (!$old) return null;
            $changed = collect(['unit', 'technical_specifications', 'ehs_requirements', 'required_by_date'])
                ->contains(fn ($field) => ($old[$field] ?? null) !== ($item[$field] ?? null));
            return $changed ? ['description' => $item['description']] : null;
        })->filter()->values();

        if ($removed->isNotEmpty()) $changes['removed_items'] = $removed->all();
        if ($added->isNotEmpty()) $changes['added_items'] = $added->all();
        if ($quantityChanges->isNotEmpty()) $changes['quantity_changes'] = $quantityChanges->all();
        if ($itemDetailChanges->isNotEmpty()) $changes['updated_items'] = $itemDetailChanges->all();

        return $changes;
    }

    private function closePrfTrackingGap(string $released, int $excludedId): void
    {
        $released = preg_replace('/-VOID$/', '', trim($released));
        if (!preg_match('/^(.*-)(\d+)$/', $released, $matches)) return;

        $prefix = $matches[1];
        $releasedSequence = (int) $matches[2];
        $later = Prf::query()
            ->where('id', '!=', $excludedId)
            ->where('prf_number', 'like', $prefix . '%')
            ->where('prf_number', 'not like', '%-VOID')
            ->lockForUpdate()
            ->get(['id', 'prf_number'])
            ->map(function (Prf $candidate) use ($prefix) {
                $tail = substr($candidate->prf_number, strlen($prefix));
                return ctype_digit($tail) ? ['id' => $candidate->id, 'sequence' => (int) $tail] : null;
            })
            ->filter(fn ($candidate) => $candidate !== null && $candidate['sequence'] > $releasedSequence)
            ->sortBy('sequence')
            ->values();

        foreach ($later as $candidate) {
            DB::table('prfs')->where('id', $candidate['id'])->update(['prf_number' => "__PRF_SHIFT__{$candidate['id']}"]);
        }
        foreach ($later as $candidate) {
            DB::table('prfs')->where('id', $candidate['id'])->update([
                'prf_number' => $prefix . str_pad((string) ($candidate['sequence'] - 1), 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    private function notifyStageApprovers(Prf $prf, string $stageStatus): void
    {
        $stage = self::PIPELINE[$stageStatus] ?? null;
        if (!$stage) return;

        $permittedRoles = DB::table('role_permissions')
            ->where('permission_key', $stage['permission'])
            ->pluck('role');

        $approvers = User::query()
            ->where('is_active', true)
            ->where('role', '!=', 'admin')
            ->whereIn('role', $permittedRoles)
            ->get();

        if ($approvers->isEmpty()) {
            $approvers = User::where('role', 'admin')->where('is_active', true)->get();
        }

        $title = "New PRF — Awaiting your approval ({$stage['label']})";
        $body  = "{$prf->requester?->name} submitted PRF {$prf->prf_number}. Awaiting your approval.";

        foreach ($approvers as $approver) {
            Notification::notifyUser(
                $approver->id,
                'prf_pending',
                $title,
                $body,
                ['prf_id' => $prf->id],
                true
            );

            // Best-effort email — don't fail the request if mail isn't configured
            if ($approver->email) {
                try {
                    Mail::to($approver->email)->send(new PrfApprovalRequested($prf, $stage['label']));
                } catch (\Throwable $e) {
                    Log::warning("PRF mail to {$approver->email} failed: " . $e->getMessage());
                }
            }
        }
    }

    private function notifyFutureStageApprovers(Prf $prf): void
    {
        foreach (['pending_procurement', 'pending_ehs', 'pending_depot'] as $stageStatus) {
            $stage = self::PIPELINE[$stageStatus];
            $permittedRoles = DB::table('role_permissions')
                ->where('permission_key', $stage['permission'])
                ->pluck('role');

            $observers = User::query()
                ->where('is_active', true)
                ->where('role', '!=', 'admin')
                ->where(function ($query) use ($stage, $permittedRoles) {
                    $query->where('role', $stage['role'])
                        ->orWhereIn('role', $permittedRoles);
                })
                ->get();

            foreach ($observers as $observer) {
                Notification::notifyUser(
                    $observer->id,
                    'prf_submitted',
                    "New PRF submitted — {$prf->prf_number}",
                    "A new PRF was submitted by {$prf->requester?->name}. It is currently waiting for Material Controller approval; your {$stage['label']} approval will become available when the previous stages are complete.",
                    ['prf_id' => $prf->id, 'path' => "/purchase-request/{$prf->id}"],
                    true
                );
            }
        }
    }

    private function notifyRequesterFinalApproved(Prf $prf, User $by): void
    {
        if (!$prf->requested_by) return;
        Notification::notifyUser(
            $prf->requested_by,
            'prf_approved',
            "PRF Fully Approved — {$prf->prf_number}",
            "Your PRF was fully approved by {$by->name}. It is ready to print.",
            ['prf_id' => $prf->id],
            true
        );
    }
}
