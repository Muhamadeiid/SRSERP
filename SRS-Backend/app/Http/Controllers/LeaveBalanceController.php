<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveBalance;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Services\LeaveDeductionService;

class LeaveBalanceController extends Controller
{
    public function __construct(private LeaveDeductionService $deductions)
    {
    }

    // ── Build a rich response with effective remainings ──────────────
    private function enriched(LeaveBalance $balance): array
    {
        $annualEff = $balance->getEffectiveRemaining('annual');
        $casualEff = $balance->getEffectiveRemaining('casual');
        $sickEff   = $balance->getEffectiveRemaining('sick');
        $earlyEff  = $balance->getEffectiveRemaining('early');

        return array_merge($balance->toArray(), [
            // Effective (usable) remainings
            'annual_remaining_effective' => $annualEff,
            'casual_remaining_effective' => $casualEff,
            'sick_remaining_effective'   => $sickEff,
            'early_remaining_effective'  => $earlyEff,
            // Combined annual pool (annual + casual together, since annual can overflow)
            'annual_pool_remaining'      => $annualEff + $casualEff,
            'annual_pool_total'          => ($balance->annual ?? 14) + ($balance->casual ?? 7),
        ]);
    }

    // GET /employees/{employee}/leave-balance
    public function show(Employee $employee): JsonResponse
    {
        $this->deductions->processDue($employee->id);

        $balance = LeaveBalance::firstOrCreate(
            ['employee_id' => $employee->id],
            ['annual' => 14, 'casual' => 7, 'sick' => 90, 'early' => 0]
        );

        return response()->json(['success' => true, 'data' => $this->enriched($balance)]);
    }

    // PUT /employees/{employee}/leave-balance  (admin/depot_manager only)
    public function update(Request $request, Employee $employee): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'depot_manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $v = $request->validate([
            'annual' => 'nullable|integer|min:0|max:365',
            'casual' => 'nullable|integer|min:0|max:365',
            'sick'   => 'nullable|integer|min:0|max:365',
            'early'  => 'nullable|integer|min:0|max:365',
        ]);

        $balance = LeaveBalance::updateOrCreate(
            ['employee_id' => $employee->id],
            array_filter($v, fn($val) => $val !== null)
        );

        return response()->json(['success' => true, 'data' => $this->enriched($balance)]);
    }
}
