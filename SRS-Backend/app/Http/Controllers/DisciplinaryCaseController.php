<?php

namespace App\Http\Controllers;

use App\Models\DisciplinaryCase;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DisciplinaryCaseController extends Controller
{
    private array $actions = [
        'verbal_warning',
        'written_warning',
        'final_warning',
        'deduction',
        'suspension',
        'termination_recommendation',
    ];

    private array $statuses = ['draft', 'submitted', 'approved', 'closed', 'cancelled'];

    public function index(Request $request): JsonResponse
    {
        $q = DisciplinaryCase::with([
            'employee:id,name,ibs_code,punch_code,department,position,work_location,no_warning_letters,status',
            'creator:id,name',
            'approver:id,name',
        ])->latest('incident_date')->latest('id');

        if ($request->filled('employee_id')) {
            $q->where('employee_id', $request->employee_id);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $q->where('status', $request->status);
        }

        if ($request->filled('violation_type') && $request->violation_type !== 'all') {
            $q->where('violation_type', $request->violation_type);
        }

        if ($request->filled('search')) {
            $term = trim((string) $request->search);
            $q->where(function ($inner) use ($term) {
                $inner->where('description', 'like', "%{$term}%")
                    ->orWhere('reported_by', 'like', "%{$term}%")
                    ->orWhere('witnesses', 'like', "%{$term}%")
                    ->orWhereHas('employee', function ($emp) use ($term) {
                        $emp->where('name', 'like', "%{$term}%")
                            ->orWhere('ibs_code', 'like', "%{$term}%")
                            ->orWhere('punch_code', 'like', "%{$term}%");
                    });
            });
        }

        $perPage = min((int) $request->get('per_page', 25), 100);
        $result = $q->paginate($perPage);

        return response()->json([
            'data' => $result->items(),
            'pagination' => [
                'total' => $result->total(),
                'per_page' => $result->perPage(),
                'current_page' => $result->currentPage(),
                'last_page' => $result->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = auth()->id();
        $data['occurrence_no'] = $this->nextOccurrence($data['employee_id'], $data['violation_type']);

        if (($data['status'] ?? 'approved') === 'approved') {
            $data['approved_by'] = auth()->id();
            $data['approved_at'] = now();
            $data['action_date'] = $data['action_date'] ?? now()->toDateString();
        }

        $case = DisciplinaryCase::create($data);
        $this->syncWarningCount($case->employee_id);

        return response()->json([
            'success' => true,
            'message' => 'Disciplinary case created',
            'data' => $case->load('employee:id,name,ibs_code,punch_code,department,position,work_location,no_warning_letters,status', 'creator:id,name', 'approver:id,name'),
        ], 201);
    }

    public function show(DisciplinaryCase $disciplinaryCase): JsonResponse
    {
        return response()->json($disciplinaryCase->load([
            'employee:id,name,ibs_code,punch_code,department,position,work_location,no_warning_letters,status',
            'creator:id,name',
            'approver:id,name',
        ]));
    }

    public function update(Request $request, DisciplinaryCase $disciplinaryCase): JsonResponse
    {
        $oldEmployeeId = $disciplinaryCase->employee_id;
        $data = $this->validated($request, true);

        $newEmployeeId = $data['employee_id'] ?? $disciplinaryCase->employee_id;
        $newViolation = $data['violation_type'] ?? $disciplinaryCase->violation_type;
        if ($newEmployeeId !== $disciplinaryCase->employee_id || $newViolation !== $disciplinaryCase->violation_type) {
            $data['occurrence_no'] = $this->nextOccurrence($newEmployeeId, $newViolation, $disciplinaryCase->id);
        }

        $newStatus = $data['status'] ?? $disciplinaryCase->status;
        if ($newStatus === 'approved' && $disciplinaryCase->status !== 'approved') {
            $data['approved_by'] = auth()->id();
            $data['approved_at'] = now();
            $data['action_date'] = $data['action_date'] ?? now()->toDateString();
        }

        $disciplinaryCase->update($data);
        $this->syncWarningCount($oldEmployeeId);
        $this->syncWarningCount($disciplinaryCase->employee_id);

        return response()->json([
            'success' => true,
            'message' => 'Disciplinary case updated',
            'data' => $disciplinaryCase->fresh(['employee:id,name,ibs_code,punch_code,department,position,work_location,no_warning_letters,status', 'creator:id,name', 'approver:id,name']),
        ]);
    }

    public function destroy(DisciplinaryCase $disciplinaryCase): JsonResponse
    {
        $employeeId = $disciplinaryCase->employee_id;
        $disciplinaryCase->delete();
        $this->syncWarningCount($employeeId);

        return response()->json(['success' => true, 'message' => 'Disciplinary case deleted']);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'total' => DisciplinaryCase::count(),
            'approved' => DisciplinaryCase::where('status', 'approved')->count(),
            'open' => DisciplinaryCase::whereIn('status', ['draft', 'submitted'])->count(),
            'warnings' => DisciplinaryCase::where('status', 'approved')->whereIn('action_taken', DisciplinaryCase::WARNING_ACTIONS)->count(),
            'repeat_cases' => DisciplinaryCase::where('occurrence_no', '>', 1)->count(),
            'by_violation' => DisciplinaryCase::selectRaw('violation_type, count(*) as count')
                ->groupBy('violation_type')
                ->orderByDesc('count')
                ->get(),
        ]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'employee_id' => [$required, 'exists:employees,id'],
            'violation_type' => [$required, 'string', 'max:80'],
            'incident_date' => [$required, 'date'],
            'location' => ['nullable', 'string', 'max:120'],
            'reported_by' => ['nullable', 'string', 'max:120'],
            'witnesses' => ['nullable', 'string', 'max:255'],
            'description' => [$required, 'string', 'max:5000'],
            'employee_statement' => ['nullable', 'string', 'max:5000'],
            'action_taken' => [$required, Rule::in($this->actions)],
            'action_date' => ['nullable', 'date'],
            'status' => ['nullable', Rule::in($this->statuses)],
            'hr_notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    private function nextOccurrence(int $employeeId, string $violationType, ?int $excludeId = null): int
    {
        $q = DisciplinaryCase::where('employee_id', $employeeId)
            ->where('violation_type', $violationType)
            ->where('status', '!=', 'cancelled');

        if ($excludeId) {
            $q->where('id', '!=', $excludeId);
        }

        return (int) $q->max('occurrence_no') + 1;
    }

    private function syncWarningCount(int $employeeId): void
    {
        $count = DisciplinaryCase::where('employee_id', $employeeId)
            ->where('status', 'approved')
            ->whereIn('action_taken', DisciplinaryCase::WARNING_ACTIONS)
            ->count();

        Employee::whereKey($employeeId)->update(['no_warning_letters' => $count]);
    }
}
