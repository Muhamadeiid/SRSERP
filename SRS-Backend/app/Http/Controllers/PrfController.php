<?php

namespace App\Http\Controllers;

use App\Mail\PrfApprovalRequested;
use App\Models\Notification;
use App\Models\Prf;
use App\Models\PrfApproval;
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
        'pending_procurement' => ['role' => 'procurement',   'permission' => 'prf.approve_procurement', 'next' => 'pending_ehs',    'label' => 'Procurement'],
        'pending_ehs'         => ['role' => 'ehs_manager',   'permission' => 'prf.approve_ehs',         'next' => 'pending_depot',  'label' => 'EHS Manager'],
        'pending_depot'       => ['role' => 'depot_manager', 'permission' => 'prf.approve_depot',       'next' => 'approved',       'label' => 'Depot Manager'],
    ];

    // ─────────────────────────────────────────────────────────────
    //  LIST
    // ─────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();

        $query = Prf::with([
            'requester:id,name,email,role,e_signature',
            'items',
            'approvals.approver:id,name,e_signature,role',
        ]);

        if ($request->boolean('mine')) {
            $query->where('requested_by', $user->id);
        }

        // Visibility rules
        if ($request->boolean('mine')) {
            // Explicit personal view always shows the signed-in user's requests only.
        } elseif ($user->isAdmin()) {
            // full visibility
        } elseif (
            in_array($user->role, ['procurement', 'purchasing', 'ehs', 'ehs_manager', 'depot_manager'], true)
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

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    // ─────────────────────────────────────────────────────────────
    //  SHOW
    // ─────────────────────────────────────────────────────────────
    public function show(Prf $prf): JsonResponse
    {
        $user = auth()->user();
        $canViewAll = $user->isAdmin()
            || in_array($user->role, ['procurement', 'purchasing', 'ehs', 'ehs_manager', 'depot_manager'], true)
            || $user->hasPermission('procurement.access')
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
        ]);

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
            'notes_image'                   => 'nullable|string',   // base64 data-URI (e.g. data:image/png;base64,...)
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

        return DB::transaction(function () use ($data, $user) {
            $prf = Prf::create([
                'prf_number'        => filled($data['prf_number'] ?? null) ? $data['prf_number'] : Prf::generateNumber(),
                'requested_by'      => $user->id,
                'date'              => $data['date']              ?? now()->toDateString(),
                'delivery_location' => $data['delivery_location'] ?? null,
                'delivery_contact'  => $data['delivery_contact']  ?? null,
                'requester_phone'   => $data['requester_phone']   ?? null,
                'requester_email'   => $data['requester_email']   ?? $user->email,
                'material_category' => $data['material_category'] ?? [],
                'notes'             => $data['notes']             ?? null,
                'notes_image'       => $data['notes_image']       ?? null,
                'status'            => 'pending_procurement',
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

            $this->notifyStageApprovers($prf, 'pending_procurement');
            $this->notifyFutureStageApprovers($prf);

            return response()->json([
                'success' => true,
                'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
            ], 201);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE / CANCEL — requester only, before the first approval
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
            'notes_image'                   => 'nullable|string',
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
            if (!$this->requesterCanModify($lockedPrf)) {
                return response()->json([
                    'success' => false,
                    'message' => 'This purchase request can no longer be edited',
                ], 403);
            }

            $data = $v->validated();
            $lockedPrf->update([
                'date'              => $data['date'] ?? $lockedPrf->date,
                'delivery_location' => $data['delivery_location'] ?? null,
                'delivery_contact'  => $data['delivery_contact'] ?? null,
                'requester_phone'   => $data['requester_phone'] ?? null,
                'requester_email'   => $data['requester_email'] ?? auth()->user()->email,
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

            return response()->json([
                'success' => true,
                'message' => 'Purchase request updated',
                'data' => $lockedPrf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
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
        if (!$user->isAdmin() && !in_array($user->role, ['depot_manager', 'procurement', 'purchasing'], true)) {
            return response()->json(['success' => false, 'message' => 'Only Procurement can edit the tracking number'], 403);
        }

        $v = Validator::make($request->all(), [
            'prf_number' => 'required|string|max:64',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $input = trim((string) $request->input('prf_number'));
        $year = (int) ($prf->date?->format('Y') ?: now()->year);
        if (ctype_digit($input)) {
            $input = "PRF-EG1-{$year}-" . str_pad($input, 4, '0', STR_PAD_LEFT);
        } elseif (preg_match('/^PRF-EG1-(\d{4})-(\d+)$/i', $input, $matches)) {
            $input = 'PRF-EG1-' . $matches[1] . '-' . str_pad($matches[2], 4, '0', STR_PAD_LEFT);
        } else {
            return response()->json(['success' => false, 'message' => 'Enter a sequence number such as 123 or a full PRF number'], 422);
        }

        if (Prf::where('prf_number', $input)->where('id', '!=', $prf->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'This PRF number is already in use'], 422);
        }

        $prf->update(['prf_number' => $input]);

        return response()->json([
            'success' => true,
            'message' => 'PRF number updated',
            'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────
    private function userCanActInStage(User $user, array $stage): bool
    {
        if ($user->isAdmin()) return true;
        // Permission Matrix drives approval authority; fall back to the legacy
        // role match so nothing breaks before permissions are granted.
        if (!empty($stage['permission']) && $user->hasPermission($stage['permission'])) {
            return true;
        }
        if ($stage['role'] === 'procurement' && $user->role === 'purchasing') {
            return true;
        }
        return $user->role === $stage['role'];
    }

    private function requesterCanModify(Prf $prf): bool
    {
        return $prf->requested_by === auth()->id()
            && $prf->status === 'pending_procurement'
            && !$prf->approvals()->exists();
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
            ->where(function ($query) use ($stage, $permittedRoles) {
                $query->where('role', $stage['role'])
                    ->orWhereIn('role', $permittedRoles);
                if ($stage['role'] === 'procurement') {
                    $query->orWhere('role', 'purchasing');
                }
            })
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
        foreach (['pending_ehs', 'pending_depot'] as $stageStatus) {
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
                    "A new PRF was submitted by {$prf->requester?->name}. It is currently waiting for Procurement approval; your {$stage['label']} approval will become available when the previous stages are complete.",
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
