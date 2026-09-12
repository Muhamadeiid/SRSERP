<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\ReleaseNote;
use App\Models\ReleaseNoteItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * Release Note (SRS-INV-P01-F06) — a two-stage form.
 *
 *  1. REQUEST    Any engineer raises the note. They type only the item name,
 *                quantity and unit; their own name and title come from their
 *                account.
 *  2. FULFILMENT The store keeper fills everything else — code, quantities,
 *                check type, receiver, type/status band — and issues the parts.
 */
class ReleaseNoteController extends Controller
{
    private const RELATIONS = [
        'creator:id,name,role',
        'requestedBy:id,name,position,e_signature',
        'inventorySpecialist:id,name,position,e_signature',
        'items',
        'items.receiver:id,name,position',
    ];

    /**
     * Owns stage 2. Approves the request, signs the note, edits any note.
     * That is: admin, depot manager, and the Material Controller employee.
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
     * Sees every note in read-only mode. Store staff — the Material
     * Controller's team — need to know what has been asked for, but they
     * cannot approve, sign, or edit anything.
     */
    private function canViewAll($user): bool
    {
        return $this->canFulfil($user)
            || strtolower((string) $user->role) === 'store_staff';
    }

    public function index(Request $request): JsonResponse
    {
        $user  = auth()->user();
        $query = ReleaseNote::with(self::RELATIONS)->orderByDesc('id');

        // Store staff (and admin / depot manager / Material Controller)
        // oversee every request; an engineer only ever sees the ones they
        // raised themselves.
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
            'success'    => true,
            'can_fulfil' => $this->canFulfil($user),
            'can_view'   => $this->canViewAll($user),
            'data'       => $query->limit((int) $request->input('per_page', 200))->get(),
        ]);
    }

    public function show(ReleaseNote $releaseNote): JsonResponse
    {
        $user    = auth()->user();
        $fulfils = $this->canFulfil($user);

        if (!$this->canViewAll($user) && $releaseNote->created_by !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $releaseNote->load(self::RELATIONS);

        return response()->json([
            'success'    => true,
            'can_fulfil' => $fulfils,
            'can_view'   => $this->canViewAll($user),
            'data'       => $releaseNote,
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

            $note->load(self::RELATIONS);

            return response()->json(['success' => true, 'can_fulfil' => $this->canFulfil($user), 'data' => $note], 201);
        });
    }

    /**
     * Stage 2 for the store keeper. The requester may still correct their own
     * item names and units while the note is pending.
     */
    public function update(Request $request, ReleaseNote $releaseNote): JsonResponse
    {
        $user    = auth()->user();
        $fulfils = $this->canFulfil($user);
        $owns    = $releaseNote->created_by === $user->id;

        if (!$fulfils && !($owns && $releaseNote->status === 'pending')) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $v = Validator::make($request->all(), $fulfils ? $this->fulfilRules() : [
            'items'                 => 'required|array|min:1',
            'items.*.item_name'     => 'required|string|max:500',
            'items.*.unit'          => 'nullable|string|max:50',
            'items.*.qty_requested' => 'nullable|numeric|min:0',
        ]);

        if ($v->fails()) {
            return response()->json(['success' => false, 'errors' => $v->errors()], 422);
        }

        $data = $v->validated();

        return DB::transaction(function () use ($releaseNote, $data, $fulfils, $user) {
            if ($fulfils) {
                $releaseNote->update($this->storeKeeperAttributes($data));
            }

            if (array_key_exists('items', $data)) {
                $this->syncItems($releaseNote, $data['items'], $fulfils);
            }

            $releaseNote->load(self::RELATIONS);

            return response()->json(['success' => true, 'can_fulfil' => $fulfils, 'data' => $releaseNote]);
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
     * The "Inventory Responsibility" signatory is the same person on every note.
     * Resolved from the employee master list so HR owns the name, not the code.
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
        // e-signature are stamped on the note the moment they accept it.
        return Employee::active()
            ->whereRaw('LOWER(position) LIKE ?', ['%material controller%'])
            ->orderBy('id')
            ->first($columns);
    }

    private function fulfilRules(): array
    {
        return [
            'date'                         => 'nullable|date',
            'type'                         => 'nullable|in:pm,cm',
            'plan_status'                  => 'nullable|in:plan,over_plan',
            'over_plan_reason'             => 'nullable|string|max:500',
            'trainset_asset_name'          => 'nullable|string|max:255',
            'work_order'                   => 'nullable|string|max:255',
            'inventory_specialist_date'    => 'nullable|date',
            'status'                       => 'nullable|in:pending,released,rejected,closed',
            'store_remark'                 => 'nullable|string|max:500',
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

    /** Header fields owned by the store keeper, plus the fixed signatory. */
    private function storeKeeperAttributes(array $data): array
    {
        $attributes = [];
        foreach (['date', 'type', 'plan_status', 'over_plan_reason', 'trainset_asset_name',
                  'work_order', 'inventory_specialist_date', 'status', 'store_remark'] as $key) {
            if (array_key_exists($key, $data)) {
                $attributes[$key] = $data[$key];
            }
        }

        // Stamp the moment the store keeper settled the request, so the
        // engineer can see when it was answered.
        if (in_array($data['status'] ?? null, ['released', 'rejected'], true)) {
            $attributes['decided_at'] = now();
        }

        $specialist = self::resolveInventorySpecialist();
        if ($specialist) {
            $attributes['inventory_specialist_employee_id'] = $specialist->id;
            $attributes['inventory_specialist_name']        = $specialist->name;
            $attributes['inventory_specialist_title']       = $specialist->position;
        }

        return $attributes;
    }

    /**
     * Replaces the item lines; blank rows from the paper grid are dropped.
     * A requester editing their own pending note only owns the name and unit,
     * so anything the store keeper already entered is carried across by row no.
     */
    private function syncItems(ReleaseNote $note, array $rows, bool $fulfils): void
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

            if (!$fulfils && $previous) {
                $attributes += $previous->only([
                    'code', 'qty_released', 'qty_returned', 'actual_qty',
                    'check_type', 'receiver_employee_id', 'receiver_name', 'receiver_title',
                ]);
            }

            if ($fulfils) {
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
}
