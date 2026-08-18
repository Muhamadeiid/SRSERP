<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\InterventionShiftPlan;
use App\Models\LeaveRequest;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InterventionShiftPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizePlanner();
        $validated = $request->validate(['week_start' => 'nullable|date']);
        [$start, $end] = $this->weekRange($validated['week_start'] ?? now()->toDateString());

        $employees = $this->interventionEmployees()
            ->orderBy('name')
            ->get(['id', 'name', 'arabic_name', 'ibs_code', 'position', 'department', 'work_location', 'weekly_off_day']);

        $employeeIds = $employees->pluck('id');
        $plans = InterventionShiftPlan::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('shift_date', [$start, $end])
            ->get(['id', 'employee_id', 'shift_date', 'shift', 'updated_at']);

        $leaves = LeaveRequest::query()
            ->where('type', 'lrf')
            ->whereIn('status', ['approved', 'cancellation_pending', 'amendment_pending'])
            ->whereIn('employee_id', $employeeIds)
            ->where('leave_type', '!=', 'early')
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start)
            ->get(['id', 'employee_id', 'leave_type', 'company_paid', 'start_date', 'end_date']);

        $leaveDays = [];
        foreach ($leaves as $leave) {
            $cursor = $leave->start_date->copy()->max($start->copy());
            $last = ($leave->end_date ?? $leave->start_date)->copy()->min($end->copy());
            while ($cursor->lte($last)) {
                $leaveDays[] = [
                    'employee_id' => (int) $leave->employee_id,
                    'date' => $cursor->toDateString(),
                    'leave_type' => $leave->company_paid ? 'company_paid' : $leave->leave_type,
                ];
                $cursor->addDay();
            }
        }

        return response()->json([
            'success' => true,
            'week_start' => $start->toDateString(),
            'week_end' => $end->toDateString(),
            'employees' => $employees,
            'plans' => $plans,
            'leave_days' => $leaveDays,
            'shifts' => $this->shifts(),
        ]);
    }

    public function bulkUpdate(Request $request): JsonResponse
    {
        $this->authorizePlanner();
        $validated = $request->validate([
            'week_start' => 'required|date',
            'rows' => 'required|array|max:1000',
            'rows.*.employee_id' => 'required|integer|exists:employees,id',
            'rows.*.date' => 'required|date',
            'rows.*.shift' => 'nullable|in:morning,afternoon,night',
        ]);
        [$start, $end] = $this->weekRange($validated['week_start']);

        $employeeIds = collect($validated['rows'])->pluck('employee_id')->unique()->values();
        $allowedIds = $this->interventionEmployees()->whereIn('id', $employeeIds)->pluck('id');
        abort_unless($allowedIds->count() === $employeeIds->count(), 422, 'Only Intervention employees can be included in this plan.');

        foreach ($validated['rows'] as $row) {
            $date = Carbon::parse($row['date']);
            abort_unless($date->betweenIncluded($start, $end), 422, 'Every shift date must be inside the selected week.');
        }

        DB::transaction(function () use ($validated) {
            foreach ($validated['rows'] as $row) {
                $key = ['employee_id' => $row['employee_id'], 'shift_date' => $row['date']];
                if (empty($row['shift'])) {
                    InterventionShiftPlan::where($key)->delete();
                    continue;
                }
                InterventionShiftPlan::updateOrCreate($key, [
                    'shift' => $row['shift'],
                    'created_by' => auth()->id(),
                ]);
            }
        });

        return response()->json(['success' => true, 'message' => 'Weekly Intervention shift plan saved.']);
    }

    private function interventionEmployees()
    {
        return Employee::active()->where(function ($query) {
            $query->whereRaw("LOWER(TRIM(COALESCE(department, ''))) IN (?, ?, ?)", [
                'intervention', 'cm intervention', 'cm_intervention',
            ]);
        });
    }

    private function authorizePlanner(): void
    {
        $role = strtolower(trim((string) auth()->user()?->role));
        abort_unless(in_array($role, ['admin', 'depot_manager', 'hr', 'ccp'], true), 403);
    }

    private function weekRange(string $date): array
    {
        $start = Carbon::parse($date)->startOfWeek(Carbon::SATURDAY)->startOfDay();
        return [$start, $start->copy()->addDays(6)->endOfDay()];
    }

    private function shifts(): array
    {
        return [
            ['key' => 'morning', 'label' => 'Morning', 'from' => '06:30', 'to' => '15:30'],
            ['key' => 'afternoon', 'label' => 'Afternoon', 'from' => '15:00', 'to' => '00:00'],
            ['key' => 'night', 'label' => 'Night', 'from' => '23:00', 'to' => '08:00'],
        ];
    }
}
