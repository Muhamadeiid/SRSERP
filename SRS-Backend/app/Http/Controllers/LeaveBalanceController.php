<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\SystemSetting;
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
            // Annual pool = the annual total (casual is a sub-limit drawn from this pool)
            'annual_pool_remaining'      => $annualEff,
            'annual_pool_total'          => $balance->annual ?? 21,
        ]);
    }

    // GET /employees/{employee}/leave-balance
    public function show(Employee $employee): JsonResponse
    {
        $this->deductions->processDue($employee->id);

        $settings = SystemSetting::whereIn('key', ['default_annual_days','default_casual_days','default_sick_days'])
            ->pluck('value', 'key');

        $balance = LeaveBalance::firstOrCreate(
            ['employee_id' => $employee->id],
            [
                'annual' => (int) ($settings['default_annual_days'] ?? 21),
                'casual' => (int) ($settings['default_casual_days'] ?? 7),
                'sick'   => (int) ($settings['default_sick_days']   ?? 90),
                'early'  => 0,
            ]
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
            'annual' => 'nullable|numeric|min:0|max:365',
            'casual' => 'nullable|numeric|min:0|max:365',
            'sick'   => 'nullable|numeric|min:0|max:365',
            'early'  => 'nullable|numeric|min:0|max:365',
        ]);

        $balance = LeaveBalance::updateOrCreate(
            ['employee_id' => $employee->id],
            array_filter($v, fn($val) => $val !== null)
        );

        return response()->json(['success' => true, 'data' => $this->enriched($balance)]);
    }
}
