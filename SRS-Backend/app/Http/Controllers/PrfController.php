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

class PrfController extends Controller
{
    // ── Stage configuration (sequential pipeline) ───────────────
    private const PIPELINE = [
        'pending_procurement' => ['role' => 'procurement',   'next' => 'pending_ehs',    'label' => 'Procurement'],
        'pending_ehs'         => ['role' => 'ehs',           'next' => 'pending_depot',  'label' => 'EHS / Safety'],
        'pending_depot'       => ['role' => 'depot_manager', 'next' => 'approved',       'label' => 'Depot Manager'],
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

        // Visibility rules
        if ($user->isAdmin()) {
            // full visibility
        } elseif ($user->role === 'procurement' || $user->role === 'ehs' || $user->role === 'depot_manager') {
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
            'delivery_location'             => 'nullable|string|max:255',
            'delivery_contact'              => 'nullable|string|max:255',
            'requester_phone'               => 'nullable|string|max:50',
            'requester_email'               => 'nullable|email|max:255',
            'material_category'             => 'nullable|array',
            'material_category.*'           => 'string|max:100',
            'notes'                         => 'nullable|string|max:2000',
            'notes_image'                   => 'nullable|string',   // base64 data-URI (e.g. data:image/png;base64,...)
            'items'                         => 'required|array|min:1',
            'items.*.description'           => 'required|string|max:500',
            'items.*.technical_specifications' => 'nullable|string|max:2000',
            'items.*.quantity'              => 'required|numeric|min:0.01',
            'items.*.unit'                  => 'nullable|string|max:50',
            'items.*.ehs_requirements'      => 'nullable|string|max:1000',
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

            return response()->json([
                'success' => true,
                'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
            ], 201);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  APPROVE
    // ─────────────────────────────────────────────────────────────
    public function approve(Request $request, Prf $prf): JsonResponse
    {
        $user  = auth()->user();
        $stage = self::PIPELINE[$prf->status] ?? null;

        if (!$stage) {
            return response()->json([
                'success' => false,
                'message' => 'This PRF is not awaiting approval',
            ], 422);
        }

        if (!$this->userCanActAsRole($user, $stage['role'])) {
            return response()->json([
                'success' => false,
                'message' => "Only {$stage['label']} can approve at this stage",
            ], 403);
        }

        $v = Validator::make($request->all(), [
            'comment' => 'nullable|string|max:1000',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        return DB::transaction(function () use ($prf, $user, $stage, $request) {
            PrfApproval::create([
                'prf_id'      => $prf->id,
                'role'        => $stage['role'],
                'action'      => 'approved',
                'approver_id' => $user->id,
                'comment'     => $request->input('comment'),
                'acted_at'    => now(),
            ]);

            $prf->update(['status' => $stage['next']]);

            // Notifications
            if ($stage['next'] === 'approved') {
                $this->notifyRequesterFinalApproved($prf, $user);
            } else {
                $this->notifyStageApprovers($prf, $stage['next']);
                $this->notifyRequesterStageMoved($prf, $stage['label']);
            }

            return response()->json([
                'success' => true,
                'message' => 'Approved',
                'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  REJECT
    // ─────────────────────────────────────────────────────────────
    public function reject(Request $request, Prf $prf): JsonResponse
    {
        $user  = auth()->user();
        $stage = self::PIPELINE[$prf->status] ?? null;

        if (!$stage) {
            return response()->json([
                'success' => false,
                'message' => 'This PRF cannot be rejected at its current state',
            ], 422);
        }

        if (!$this->userCanActAsRole($user, $stage['role'])) {
            return response()->json([
                'success' => false,
                'message' => "Only {$stage['label']} can reject at this stage",
            ], 403);
        }

        $v = Validator::make($request->all(), [
            'comment' => 'required|string|max:1000',
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        return DB::transaction(function () use ($prf, $user, $stage, $request) {
            PrfApproval::create([
                'prf_id'      => $prf->id,
                'role'        => $stage['role'],
                'action'      => 'rejected',
                'approver_id' => $user->id,
                'comment'     => $request->input('comment'),
                'acted_at'    => now(),
            ]);

            // Void the number so the next PRF can reuse it
            $originalNumber = $prf->prf_number;
            $voidNumber     = str_ends_with($originalNumber, '-VOID') ? $originalNumber : $originalNumber . '-VOID';

            $prf->update(['status' => 'rejected', 'prf_number' => $voidNumber]);

            if ($prf->requested_by) {
                Notification::notifyUser(
                    $prf->requested_by,
                    'prf_rejected',
                    "PRF Rejected — {$originalNumber}",
                    "Your PRF was rejected by {$user->name} ({$stage['label']}): {$request->input('comment')}",
                    ['prf_id' => $prf->id]
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Rejected',
                'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
            ]);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UPDATE TRACKING NO  (procurement / admin only)
    // ─────────────────────────────────────────────────────────────
    public function updateTrackingNo(Request $request, Prf $prf): JsonResponse
    {
        $user = auth()->user();
        if (!$user->isAdmin() && $user->role !== 'purchasing') {
            return response()->json(['success' => false, 'message' => 'Only Procurement can edit the tracking number'], 403);
        }

        $v = Validator::make($request->all(), [
            'prf_number' => 'required|string|max:64|unique:prfs,prf_number,' . $prf->id,
        ]);
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $prf->update(['prf_number' => $request->input('prf_number')]);

        return response()->json([
            'success' => true,
            'message' => 'PRF number updated',
            'data'    => $prf->fresh(['requester', 'items', 'approvals.approver']),
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────
    private function userCanActAsRole(User $user, string $stageRole): bool
    {
        if ($user->isAdmin()) return true;
        return $user->role === $stageRole;
    }

    private function notifyStageApprovers(Prf $prf, string $stageStatus): void
    {
        $stage = self::PIPELINE[$stageStatus] ?? null;
        if (!$stage) return;

        $approvers = User::where('role', $stage['role'])
            ->where('is_active', true)
            ->get();

        $title = "New PRF — Awaiting your approval ({$stage['label']})";
        $body  = "{$prf->requester?->name} submitted PRF {$prf->prf_number}. Awaiting your approval.";

        foreach ($approvers as $approver) {
            Notification::notifyUser(
                $approver->id,
                'prf_pending',
                $title,
                $body,
                ['prf_id' => $prf->id]
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

    private function notifyRequesterStageMoved(Prf $prf, string $stageLabelDone): void
    {
        if (!$prf->requested_by) return;
        Notification::notifyUser(
            $prf->requested_by,
            'prf_stage_moved',
            "PRF Approved ({$stageLabelDone}) — {$prf->prf_number}",
            "Your PRF was approved by {$stageLabelDone}. Awaiting next stage.",
            ['prf_id' => $prf->id]
        );
    }

    private function notifyRequesterFinalApproved(Prf $prf, User $by): void
    {
        if (!$prf->requested_by) return;
        Notification::notifyUser(
            $prf->requested_by,
            'prf_approved',
            "PRF Fully Approved — {$prf->prf_number}",
            "Your PRF was fully approved by {$by->name}. It is ready to print.",
            ['prf_id' => $prf->id]
        );
    }
}
