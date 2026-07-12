<?php

namespace App\Http\Controllers;

use App\Models\Withdrawal;
use App\Models\Equipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WithdrawalController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Withdrawal::with('equipment:id,code,name,type,train_number,status')
            ->latest();

        if ($request->filled('status'))
            $q->where('status', $request->status);
        if ($request->filled('equipment_id'))
            $q->where('equipment_id', $request->equipment_id);
        if ($request->filled('search'))
            $q->where(function ($sq) use ($request) {
                $s = "%{$request->search}%";
                $sq->where('withdrawal_no', 'like', $s)
                   ->orWhere('reason', 'like', $s)
                   ->orWhereHas('equipment', fn($e) => $e->where('code', 'like', $s)->orWhere('name', 'like', $s));
            });

        $perPage = $request->integer('per_page', 50);
        return response()->json($q->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'        => 'required|exists:equipment,id',
            'withdrawal_date'     => 'required|date',
            'expected_return_date' => 'nullable|date',
            'reason'              => 'required|string|max:255',
            'description'         => 'nullable|string',
            'notes'               => 'nullable|string',
        ]);

        $data['withdrawal_no'] = $this->generateNo();
        $data['withdrawn_by']  = auth()->id();
        $data['status']        = 'active';

        $withdrawal = Withdrawal::create($data);

        Equipment::where('id', $data['equipment_id'])
            ->update(['status' => 'out_of_service']);

        return response()->json($withdrawal->load('equipment:id,code,name'), 201);
    }

    public function show(Withdrawal $withdrawal): JsonResponse
    {
        return response()->json($withdrawal->load('equipment:id,code,name,type,train_number,status'));
    }

    public function update(Request $request, Withdrawal $withdrawal): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'        => 'sometimes|exists:equipment,id',
            'withdrawal_date'     => 'sometimes|date',
            'expected_return_date' => 'nullable|date',
            'actual_return_date'   => 'nullable|date',
            'reason'              => 'sometimes|string|max:255',
            'description'         => 'nullable|string',
            'status'              => 'nullable|in:active,returned,extended',
            'notes'               => 'nullable|string',
        ]);

        $withdrawal->update($data);

        if (($data['status'] ?? null) === 'returned') {
            $withdrawal->update(['actual_return_date' => $data['actual_return_date'] ?? now()]);

            $hasOtherActive = Withdrawal::where('equipment_id', $withdrawal->equipment_id)
                ->where('id', '!=', $withdrawal->id)
                ->where('status', 'active')
                ->exists();

            if (!$hasOtherActive) {
                Equipment::where('id', $withdrawal->equipment_id)
                    ->update(['status' => 'available']);
            }
        }

        return response()->json($withdrawal->load('equipment:id,code,name'));
    }

    public function destroy(Withdrawal $withdrawal): JsonResponse
    {
        $withdrawal->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function stats(Request $request): JsonResponse
    {
        return response()->json([
            'total'      => Withdrawal::count(),
            'active'     => Withdrawal::where('status', 'active')->count(),
            'returned'   => Withdrawal::where('status', 'returned')->count(),
            'extended'   => Withdrawal::where('status', 'extended')->count(),
            'this_month' => Withdrawal::whereMonth('withdrawal_date', now()->month)
                                      ->whereYear('withdrawal_date', now()->year)->count(),
        ]);
    }

    private function generateNo(): string
    {
        $year = now()->format('y');
        $last = Withdrawal::withTrashed()
            ->where('withdrawal_no', 'like', "WD-{$year}-%")
            ->orderByRaw('CAST(SUBSTRING_INDEX(withdrawal_no, "-", -1) AS UNSIGNED) DESC')
            ->value('withdrawal_no');

        $next = $last ? (int) substr($last, strrpos($last, '-') + 1) + 1 : 1;
        return sprintf('WD-%s-%04d', $year, $next);
    }
}
