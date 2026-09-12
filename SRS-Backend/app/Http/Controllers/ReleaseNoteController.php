<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\ReleaseNote;
use App\Models\ReleaseNoteActivity;
use App\Models\ReleaseNoteItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Release Note (SRS-INV-P01-F06) — three-stage workflow.
 *
 *   1. REQUEST  Any engineer raises the note. They type only the item name,
 *               quantity and unit; their own name and title come from their
 *               account.
 *   2. PREPARE  Store staff pick codes, verify quantities, fix an item name
 *               the engineer got slightly wrong. Every edit is written to
 *               release_note_activities so the requester and everyone else
 *               viewing the note can see who touched what. When the parts
 *               are ready they flip the status to ready_for_approval.
 *   3. APPROVE  The Material Controller (or admin / depot manager) reviews
 *               the prepared note and either releases or rejects it. Their
 *               name and e-signature are stamped into the Inventory
 *               Responsibility row at release time.
 */
class ReleaseNoteController extends Controller
{
    private const RELATIONS = [
        'creator:id,name,role',
        'requestedBy:id,name,position,e_signature',
        'inventorySpecialist:id,name,position,e_signature',
        'items',
        'items.receiver:id,name,position',
        'activities.user:id,name,role',
    ];

    /**
     * Approves, signs, edits any note. Admin, depot manager, and the
     * Material Controller employee's linked user account.
     */
    private function canFulfil($user): bool
    {
        if (in_array(strtolower((string) $user->role), ['admin', 'depot_manager'], true)) {
            return true;
        }

        $specialist = self::resolveInventorySpecialist();

        return $specialist && (int) $specialist->user_id === (int) $user->id;
    }

    /**
     * Prepares the note — edits items, marks it ready for approval. Store
     * staff (Material Controller's team) plus everyone who can fulfil.
     * Store staff can never approve or sign; that stays with canFulfil.
     */
    private function canPrepare($user): bool
    {
        return $this->canFulfil($user)
            || strtolower((string) $user->role) === 'store_staff';
    }

    /** Sees every note read-only. Store staff and everyone above. */
    private function canViewAll($user): bool
    {
        return $this->canPrepare($user);
    }

    public function index(Request $request): JsonResponse
    {
        $user  = auth()->user();
        $query = ReleaseNote::with(self::RELATIONS)->orderByDesc('id');

        // Overview for the store team; engineers only see the ones they raised.
        if (!$this->canViewAll($user)) {
            $query->where('created_by', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $term = '%' . $request->search . '%';
            $query->where(function ($q) use ($term) {
                $q->where('prn_number', 'like', $term)
                  ->orWhere('trainset_asset_name', 'like', $term)
                  ->orWhere('work_order', 'like', $term)
                  ->orWhere('requested_by_name', 'like', $term);
            });
        }

        return response()->json([
            'success'     => true,
            'can_fulfil'  => $this->canFulfil($user),
            'can_prepare' => $this->canPrepare($user),
            'can_view'    => $this->canViewAll($user),
            'data'        => $query->limit((int) $request->input('per_page', 200))->get(),
        ]);
    }

    public function show(ReleaseNote $releaseNote): JsonResponse
    {
        $user = auth()->user();

        if (!$this->canViewAll($user) && $releaseNote->created_by !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $releaseNote->load(self::RELATIONS);

        return response()->json([
            'success'     => true,
            'can_fulfil'  => $this->canFulfil($user),
            'can_prepare' => $this->canPrepare($user),
            'can_view'    => $this->canViewAll($user),
            'data'        => $releaseNote,
        ]);
    }

    /**
     * Stage 1. The requester supplies item lines only; every identity field is
     * taken from their account so the note cannot be raised in someone's name.
     */
    public function store(Request $request): JsonResponse
    {
        $v = Validator::make($request->all(), [
            'items'                 => 'required|array|min:1',
            'items.*.item_name'     => 'required|string|max:500',
            'items.*.unit'          => 'nullable|string|max:50',
            'items.*.qty_requested' => 'nullable|numeric|min:0',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $user      = auth()->user();
        $requester = Employee::where('user_id', $user->id)->first(['id', 'name', 'position']);

        return DB::transaction(function () use ($v, $user, $requester) {
            $note = ReleaseNote::create([
                'prn_number'               => ReleaseNote::generateNumber(),
                'date'                     => now()->toDateString(),
                'requested_by_employee_id' => $requester?->id,
                'requested_by_name'        => $requester?->name ?? $user->name,
                'requested_by_title'       => $requester?->position,
                'requested_by_date'        => now()->toDateString(),
                'status'                   => 'pending',
                'created_by'               => $user->id,
            ]);

            $no = 0;
            foreach ($v->validated()['items'] as $row) {
                ReleaseNoteItem::create([
                    'release_note_id' => $note->id,
                    'no'              => ++$no,
                    'item_name'       => $row['item_name'],
                    'unit'            => $row['unit'] ?? null,
                    'qty_requested'   => $row['qty_requested'] ?? null,
                ]);
            }

            $this->log($note, $user, 'created');
            $note->load(self::RELATIONS);

            return response()->json([
                'success'     => true,
                'can_fulfil'  => $this->canFulfil($user),
                'can_prepare' => $this->canPrepare($user),
                'data'        => $note,
            ], 201);
        });
    }

    /**
     * Stage 2 and 3. The role decides which fields validate: fulfillers own
     * every field, store staff own the prep set, requesters only their own
     * pending draft. Whatever changes get written to release_note_activities
     * so the requester and everyone else viewing the note see who did what.
     */
    public function update(Request $request, ReleaseNote $releaseNote): JsonResponse
    {
        $user     = auth()->user();
        $fulfils  = $this->canFulfil($user);
        $prepares = $this->canPrepare($user);
        $owns     = $releaseNote->created_by === $user->id;

        $canEdit = $fulfils
            || ($prepares && in_array($releaseNote->status, ['pending', 'ready_for_approval', 'rejected'], true))
            || ($owns && $releaseNote->status === 'pending');

        if (!$canEdit) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        // Only fulfillers may push the note to released/rejected/closed.
        // Store staff can move it to ready_for_approval and pull it back.
        $requestedStatus = $request->input('status');
        if ($requestedStatus && $requestedStatus !== $releaseNote->status) {
            $allowed = $fulfils
                ? ['pending', 'ready_for_approval', 'released', 'rejected', 'closed']
                : ($prepares
                    ? ['pending', 'ready_for_approval']
                    : ['pending']);
            if (!in_array($requestedStatus, $allowed, true)) {
                return response()->json(['success' => false, 'message' => 'You cannot set that status.'], 403);
            }
        }

        $v = Validator::make($request->all(), $this->rulesFor($fulfils, $prepares));
        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        return DB::transaction(function () use ($releaseNote, $data, $fulfils, $prepares, $user) {
            $before         = $this->snapshot($releaseNote);
            $previousStatus = $releaseNote->status;

            if ($fulfils) {
                $releaseNote->update($this->fulfilAttributes($data));
            } elseif ($prepares) {
                $releaseNote->update($this->prepareAttributes($data));
            }

            if (array_key_exists('items', $data)) {
                $this->syncItems($releaseNote, $data['items'], $fulfils || $prepares);
            }

            $releaseNote->refresh();
            $after = $this->snapshot($releaseNote);

            $this->logDiff($releaseNote, $user, $before, $after);
            $this->logStatusTransition($releaseNote, $user, $previousStatus, $releaseNote->status);

            $releaseNote->load(self::RELATIONS);

            return response()->json([
                'success'     => true,
                'can_fulfil'  => $fulfils,
                'can_prepare' => $prepares,
                'data'        => $releaseNote,
            ]);
        });
    }

    public function destroy(ReleaseNote $releaseNote): JsonResponse
    {
        $user = auth()->user();
        if (!$this->canFulfil($user) && $releaseNote->created_by !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $releaseNote->delete();

        return response()->json(['success' => true]);
    }

    /**
     * GET /api/release-notes/inventory-specialist
     * The "Inventory Responsibility" signatory is the Material Controller.
     */
    public function inventorySpecialist(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => self::resolveInventorySpecialist()]);
    }

    public static function resolveInventorySpecialist(): ?Employee
    {
        $columns = ['id', 'name', 'position', 'e_signature', 'user_id'];

        $configuredId = config('srs.inventory_specialist_employee_id');
        if ($configuredId) {
            $employee = Employee::find($configuredId, $columns);
            if ($employee) {
                return $employee;
            }
        }

        // The Material Controller is the store owner. Their name and
        // e-signature are stamped on the note when they release it.
        return Employee::active()
            ->whereRaw('LOWER(position) LIKE ?', ['%material controller%'])
            ->orderBy('id')
            ->first($columns);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    private function rulesFor(bool $fulfils, bool $prepares): array
    {
        if ($fulfils) {
            return $this->fulfilRules();
        }
        if ($prepares) {
            return $this->prepareRules();
        }
        return [
            'items'                 => 'required|array|min:1',
            'items.*.item_name'     => 'required|string|max:500',
            'items.*.unit'          => 'nullable|string|max:50',
            'items.*.qty_requested' => 'nullable|numeric|min:0',
        ];
    }

    private function fulfilRules(): array
    {
        return $this->itemRules() + [
            'date'                      => 'nullable|date',
            'type'                      => 'nullable|in:pm,cm',
            'plan_status'               => 'nullable|in:plan,over_plan',
            'over_plan_reason'          => 'nullable|string|max:500',
            'trainset_asset_name'       => 'nullable|string|max:255',
            'work_order'                => 'nullable|string|max:255',
            'inventory_specialist_date' => 'nullable|date',
            'status'                    => 'nullable|in:pending,ready_for_approval,released,rejected,closed',
            'store_remark'              => 'nullable|string|max:500',
        ];
    }

    /** Store staff prep: item edits + header details, no signatory fields. */
    private function prepareRules(): array
    {
        return $this->itemRules() + [
            'date'                => 'nullable|date',
            'trainset_asset_name' => 'nullable|string|max:255',
            'work_order'          => 'nullable|string|max:255',
            'type'                => 'nullable|in:pm,cm',
            'plan_status'         => 'nullable|in:plan,over_plan',
            'over_plan_reason'    => 'nullable|string|max:500',
            'status'              => 'nullable|in:pending,ready_for_approval',
            'store_remark'        => 'nullable|string|max:500',
        ];
    }

    private function itemRules(): array
    {
        return [
            'items'                        => 'nullable|array',
            'items.*.item_name'            => 'nullable|string|max:500',
            'items.*.unit'                 => 'nullable|string|max:50',
            'items.*.qty_requested'        => 'nullable|numeric|min:0',
            'items.*.code'                 => 'nullable|string|max:100',
            'items.*.qty_released'         => 'nullable|numeric|min:0',
            'items.*.qty_returned'         => 'nullable|numeric|min:0',
            'items.*.actual_qty'           => 'nullable|numeric|min:0',
            'items.*.check_type'           => 'nullable|string|max:100',
            'items.*.receiver_employee_id' => 'nullable|exists:employees,id',
            'items.*.receiver_name'        => 'nullable|string|max:255',
            'items.*.receiver_title'       => 'nullable|string|max:255',
        ];
    }

    // ── Header attribute builders ────────────────────────────────────────────

    private function fulfilAttributes(array $data): array
    {
        $attributes = [];
        foreach (['date', 'type', 'plan_status', 'over_plan_reason', 'trainset_asset_name',
                  'work_order', 'inventory_specialist_date', 'status', 'store_remark'] as $key) {
            if (array_key_exists($key, $data)) {
                $attributes[$key] = $data[$key];
            }
        }

        // Stamp release moment + Material Controller identity on approval.
        if (($data['status'] ?? null) === 'released') {
            $attributes['decided_at']                       = now();
            $specialist                                     = self::resolveInventorySpecialist();
            $attributes['inventory_specialist_employee_id'] = $specialist?->id;
            $attributes['inventory_specialist_name']        = $specialist?->name;
            $attributes['inventory_specialist_title']       = $specialist?->position;
            $attributes['inventory_specialist_date']        = $data['inventory_specialist_date']
                ?? now()->toDateString();
        } elseif (($data['status'] ?? null) === 'rejected') {
            $attributes['decided_at'] = now();
        }

        return $attributes;
    }

    private function prepareAttributes(array $data): array
    {
        $attributes = [];
        foreach (['date', 'trainset_asset_name', 'work_order', 'type',
                  'plan_status', 'over_plan_reason', 'status', 'store_remark'] as $key) {
            if (array_key_exists($key, $data)) {
                $attributes[$key] = $data[$key];
            }
        }
        return $attributes;
    }

    // ── Items ────────────────────────────────────────────────────────────────

    /**
     * Replaces the item lines; blank rows from the paper grid are dropped.
     * A requester editing their own pending note only owns the name, unit
     * and requested qty, so anything the store keeper already entered is
     * carried across by row number.
     */
    private function syncItems(ReleaseNote $note, array $rows, bool $storeSide): void
    {
        $existing = $note->items()->get()->keyBy('no');
        $note->items()->delete();

        $no = 0;
        foreach ($rows as $row) {
            if (($row['item_name'] ?? '') === '') {
                continue;
            }

            $previous = $existing->get(++$no);
            $attributes = [
                'release_note_id' => $note->id,
                'no'              => $no,
                'item_name'       => $row['item_name'],
                'unit'            => $row['unit'] ?? null,
                'qty_requested'   => $row['qty_requested'] ?? null,
            ];

            if (!$storeSide && $previous) {
                $attributes += $previous->only([
                    'code', 'qty_released', 'qty_returned', 'actual_qty',
                    'check_type', 'receiver_employee_id', 'receiver_name', 'receiver_title',
                ]);
            }

            if ($storeSide) {
                $attributes += [
                    'code'                 => $row['code'] ?? null,
                    'qty_released'         => $row['qty_released'] ?? null,
                    'qty_returned'         => $row['qty_returned'] ?? null,
                    'actual_qty'           => $row['actual_qty'] ?? null,
                    'check_type'           => $row['check_type'] ?? null,
                    'receiver_employee_id' => $row['receiver_employee_id'] ?? null,
                    'receiver_name'        => $row['receiver_name'] ?? null,
                    'receiver_title'       => $row['receiver_title'] ?? null,
                ];
            }

            ReleaseNoteItem::create($attributes);
        }
    }

    // ── Activity log ─────────────────────────────────────────────────────────

    /** Fields worth logging when they change on the header. */
    private const HEADER_FIELDS = [
        'date', 'type', 'plan_status', 'over_plan_reason', 'trainset_asset_name',
        'work_order', 'store_remark',
    ];

    /** Fields worth logging when they change on an item row. */
    private const ITEM_FIELDS = [
        'item_name', 'unit', 'qty_requested', 'code',
        'qty_released', 'qty_returned', 'actual_qty',
        'check_type', 'receiver_name', 'receiver_title',
    ];

    private function snapshot(ReleaseNote $note): array
    {
        $header = [];
        foreach (self::HEADER_FIELDS as $field) {
            $header[$field] = $note->getAttribute($field);
        }

        $items = [];
        foreach ($note->items()->orderBy('no')->get() as $item) {
            $row = [];
            foreach (self::ITEM_FIELDS as $field) {
                $row[$field] = $item->getAttribute($field);
            }
            $items[$item->no] = $row;
        }

        return ['header' => $header, 'items' => $items];
    }

    private function log(ReleaseNote $note, $user, string $kind, ?array $details = null, ?int $itemNo = null): void
    {
        ReleaseNoteActivity::create([
            'release_note_id' => $note->id,
            'user_id'         => $user->id,
            'kind'            => $kind,
            'item_no'         => $itemNo,
            'details'         => $details,
        ]);
    }

    private function logDiff(ReleaseNote $note, $user, array $before, array $after): void
    {
        // Header edits.
        foreach (self::HEADER_FIELDS as $field) {
            $b = $before['header'][$field] ?? null;
            $a = $after['header'][$field] ?? null;
            if ($this->normalise($b) !== $this->normalise($a)) {
                $this->log($note, $user, 'edited', [
                    'field'  => $field,
                    'before' => $b,
                    'after'  => $a,
                ]);
            }
        }

        // Item edits, additions, removals — keyed by row number.
        $beforeItems = $before['items'] ?? [];
        $afterItems  = $after['items']  ?? [];
        $rows        = array_unique(array_merge(array_keys($beforeItems), array_keys($afterItems)));
        sort($rows);

        foreach ($rows as $no) {
            $b = $beforeItems[$no] ?? null;
            $a = $afterItems[$no] ?? null;

            if ($b === null && $a !== null) {
                $this->log($note, $user, 'item_added', ['item' => $a], $no);
                continue;
            }
            if ($a === null && $b !== null) {
                $this->log($note, $user, 'item_removed', ['item' => $b], $no);
                continue;
            }
            foreach (self::ITEM_FIELDS as $field) {
                $bv = $b[$field] ?? null;
                $av = $a[$field] ?? null;
                if ($this->normalise($bv) !== $this->normalise($av)) {
                    $this->log($note, $user, 'edited', [
                        'field'  => $field,
                        'before' => $bv,
                        'after'  => $av,
                    ], $no);
                }
            }
        }
    }

    private function logStatusTransition(ReleaseNote $note, $user, ?string $before, ?string $after): void
    {
        if ($before === $after) {
            return;
        }

        $map = [
            'ready_for_approval' => 'marked_ready',
            'released'           => 'released',
            'rejected'           => 'rejected',
            'pending'            => 'reopened',
            'closed'             => 'closed',
        ];

        $kind = $map[$after] ?? 'status_changed';
        $this->log($note, $user, $kind, ['from' => $before, 'to' => $after]);
    }

    /** Coerce for equality — numeric strings compare to floats, blank ≡ null. */
    private function normalise($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }
        return (string) $value;
    }
}
