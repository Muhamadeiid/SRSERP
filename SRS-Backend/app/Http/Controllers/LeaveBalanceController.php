<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Services\LeaveDeductionService;
use App\Services\LeaveYearService;
use Illuminate\Support\Facades\DB;

class LeaveBalanceController extends Controller
{
    public function __construct(
        private LeaveDeductionService $deductions,
        private LeaveYearService $leaveYears
    )
    {
    }

    // ── Build a rich response with effective remainings ──────────────
    private function openCommitments(int $employeeId): array
    {
        $rows = LeaveRequest::query()
            ->where('type', 'lrf')
            ->where('employee_id', $employeeId)
            ->whereNull('balance_deducted_at')
            ->whereIn('status', ['pending', 'manager_approved', 'hr_approved', 'approved'])
            ->whereIn('leave_type', ['annual', 'casual', 'sick', 'early'])
            ->where('days', '>', 0)
            ->where(function ($q) {
                $q->where('paid', true)->orWhereNull('paid');
            })
            ->selectRaw('leave_type, SUM(days) as days')
            ->groupBy('leave_type')
            ->pluck('days', 'leave_type');

        return [
            'annual' => (float) ($rows['annual'] ?? 0),
            'casual' => (float) ($rows['casual'] ?? 0),
            'sick'   => (float) ($rows['sick'] ?? 0),
            'early'  => (float) ($rows['early'] ?? 0),
        ];
    }

    private function enriched(LeaveBalance $balance): array
    {
        $reserved = $this->openCommitments((int) $balance->employee_id);

        $annualBase = $balance->getEffectiveRemaining('annual');
        $casualBase = $balance->getEffectiveRemaining('casual');
        $sickBase   = $balance->getEffectiveRemaining('sick');

        $annualCommitted = $reserved['annual'] + $reserved['casual'] + $reserved['early'];
        $annualEff = max(0, $annualBase - $annualCommitted);
        $casualEff = min(
            $annualEff,
            max(0, $casualBase - $reserved['casual'])
        );
        $sickEff   = max(0, $sickBase - $reserved['sick']);
        $earlyEff  = $annualEff;

        return array_merge($balance->toArray(), [
            // Effective (usable) remainings
            'annual_remaining_effective' => $annualEff,
            'casual_remaining_effective' => $casualEff,
            'sick_remaining_effective'   => $sickEff,
            'early_remaining_effective'  => $earlyEff,
            'reserved_annual_days'       => $reserved['annual'],
            'reserved_casual_days'       => $reserved['casual'],
            'reserved_sick_days'         => $reserved['sick'],
            'reserved_early_days'        => $reserved['early'],
            // Annual pool = the annual total (casual is a sub-limit drawn from this pool)
            'annual_pool_remaining'      => $annualEff,
            'annual_pool_total'          => $balance->annual ?? 21,
        ]);
    }

    // GET /employees/{employee}/leave-balance
    public function show(Employee $employee): JsonResponse
    {
        $user = auth()->user();
        $isOwnBalance = (int) $employee->user_id === (int) $user->id;
        $isAssignedManager = (int) $employee->user_manager_id === (int) $user->id;
        $isEmployeeManager = $employee->direct_manager_id
            && Employee::whereKey($employee->direct_manager_id)
                ->where('user_id', $user->id)
                ->exists();

        if (!$user->isHR() && !$isOwnBalance && !$isAssignedManager && !$isEmployeeManager) {
            return response()->json([
                'success' => false,
                'message' => 'You can only view your own balance or the balance of an assigned employee.',
            ], 403);
        }

        $this->deductions->processDue($employee->id);
        $this->leaveYears->refreshDue($employee->id);

        $settings = SystemSetting::whereIn('key', ['default_annual_days','default_casual_days','default_sick_days'])
            ->pluck('value', 'key');

        $balance = LeaveBalance::firstOrCreate(
            ['employee_id' => $employee->id],
            [
                'annual' => (int) ($settings['default_annual_days'] ?? 21),
                'casual' => (int) ($settings['default_casual_days'] ?? 7),
                'sick'   => (int) ($settings['default_sick_days']   ?? 90),
                'early'  => 0,
                'leave_cycle_started_on' => $this->leaveYears->currentCycleStart()->toDateString(),
            ]
        );

        return response()->json(['success' => true, 'data' => $this->enriched($balance)]);
    }

    // PUT /employees/{employee}/leave-balance  (HR/admin/depot_manager only)
    public function update(Request $request, Employee $employee): JsonResponse
    {
        $user = auth()->user();
        if (!in_array($user->role, ['admin', 'depot_manager', 'hr'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $v = $request->validate([
            'annual' => 'nullable|numeric|min:0|max:365',
            'casual' => 'nullable|numeric|min:0|max:365',
            'sick'   => 'nullable|numeric|min:0|max:365',
            'early'  => 'nullable|numeric|min:0|max:365',
            'annual_remaining' => 'nullable|numeric|min:0|max:365',
            'casual_remaining' => 'nullable|numeric|min:0|max:365',
        ]);

        $balance = DB::transaction(function () use ($employee, $v) {
            $balance = LeaveBalance::where('employee_id', $employee->id)
                ->lockForUpdate()
                ->first() ?? new LeaveBalance(['employee_id' => $employee->id]);

            foreach (['annual', 'casual', 'sick', 'early'] as $type) {
                if (!array_key_exists($type, $v) || $v[$type] === null) {
                    continue;
                }

                $oldTotal = (float) ($balance->{$type} ?? $v[$type]);
                $oldRemaining = $balance->{$type . '_remaining'};
                $newTotal = (float) $v[$type];

                $balance->{$type} = $newTotal;
                if ($oldRemaining !== null) {
                    $used = max(0, $oldTotal - (float) $oldRemaining);
                    $balance->{$type . '_remaining'} = max(0, $newTotal - $used);
                }
            }

            foreach (['annual', 'casual'] as $type) {
                $remainingKey = $type . '_remaining';
                if (!array_key_exists($remainingKey, $v) || $v[$remainingKey] === null) {
                    continue;
                }

                $total = (float) ($balance->{$type} ?? 0);
                if ((float) $v[$remainingKey] > $total) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        $remainingKey => ucfirst($type) . ' current remaining cannot be greater than its total entitlement.',
                    ]);
                }
                $balance->{$remainingKey} = (float) $v[$remainingKey];
            }

            $balance->save();
            return $balance->fresh();
        });

        return response()->json(['success' => true, 'data' => $this->enriched($balance)]);
    }
}
