<?php

namespace App\Http\Controllers;

use App\Models\IncidentReport;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class IncidentReportController extends Controller
{
    private const REVIEW_ROLES = ['admin', 'depot_manager', 'hr'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = IncidentReport::with($this->relations(false))->latest('report_date')->latest('id');

        if (! in_array($user->role, self::REVIEW_ROLES, true)) {
            $query->where(fn ($visible) => $visible
                ->where('created_by', $user->id)
                ->orWhereHas('requesterEmployee', fn ($employee) => $this->scopeEmployeeVisibleTo($employee, $user))
            );
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $term = trim((string) $request->search);
            $query->where(function ($q) use ($term) {
                $q->where('report_no', 'like', "%{$term}%")
                    ->orWhere('concerned_area_department', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
                    ->orWhereHas('requesterEmployee', fn ($employee) => $employee->where('name', 'like', "%{$term}%"))
                    ->orWhereHas('requester', fn ($u) => $u->where('name', 'like', "%{$term}%"));
            });
        }

        return response()->json($query->paginate(min((int) $request->get('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $isHr = in_array($request->user()->role, ['admin', 'hr'], true);
        if (! $isHr) {
            $data = array_intersect_key($data, ['description' => true, 'requester_employee_id' => true]);
            $data['report_date'] = now()->toDateString();
        }
        $data['report_date'] ??= now()->toDateString();
        $data['created_by'] = $request->user()->id;
        $data['report_no'] = 'MCI-TMP-' . Str::uuid();
        $data['status'] = 'submitted';
        if ($isHr) $this->storePictures($request, $data);

        $report = IncidentReport::create($data);
        $report->update(['report_no' => sprintf('MCI-%s-%04d', now()->format('Y'), $report->id)]);
        $this->notifyReviewers($report->fresh()->load('requesterEmployee:id,name'), $request->user());
        return response()->json(['success' => true, 'data' => $report->load($this->relations())], 201);
    }

    public function show(Request $request, IncidentReport $incidentReport): JsonResponse
    {
        $this->authorizeView($request->user(), $incidentReport);
        return response()->json(['data' => $incidentReport->load($this->relations())]);
    }

    public function update(Request $request, IncidentReport $incidentReport): JsonResponse
    {
        $user = $request->user();
        $isReviewer = in_array($user->role, self::REVIEW_ROLES, true);
        $isHr = in_array($user->role, ['admin', 'hr'], true);
        $isDepot = in_array($user->role, ['admin', 'depot_manager'], true);
        abort_unless($isReviewer || ($incidentReport->created_by === $user->id && $incidentReport->status === 'submitted'), 403);

        $data = $this->validated($request, true);
        if (! $isHr) {
            $allowed = $isDepot ? ['depot_manager_signed'] : ['description', 'requester_employee_id'];
            $data = array_intersect_key($data, array_flip($allowed));
        } else {
            if (array_key_exists('hr_signed', $data)) {
                $data['hr_generalist_id'] = $data['hr_signed'] ? $user->id : null;
                $data['hr_signed_at'] = $data['hr_signed'] ? now()->toDateString() : null;
                unset($data['hr_signed']);
            }
            if (! empty($data['needs_investigation']) && ($data['status'] ?? null) === 'submitted') {
                $data['status'] = 'under_investigation';
            }
            if (! empty($data['investigation_notes'])) {
                $data['followed_up_by'] = $user->id;
                $data['follow_up_date'] = $data['follow_up_date'] ?? now()->toDateString();
            }
        }

        if ($isDepot && array_key_exists('depot_manager_signed', $data)) {
            $data['depot_manager_id'] = $data['depot_manager_signed'] ? $user->id : null;
            $data['depot_manager_signed_at'] = $data['depot_manager_signed'] ? now()->toDateString() : null;
            unset($data['depot_manager_signed']);
        }

        if ($isHr) $this->storePictures($request, $data, $incidentReport);
        $incidentReport->update($data);
        return response()->json(['success' => true, 'data' => $incidentReport->fresh()->load($this->relations())]);
    }

    public function picture(Request $request, IncidentReport $incidentReport, int $slot)
    {
        $this->authorizeView($request->user(), $incidentReport);
        abort_unless(in_array($slot, [1, 2], true), 404);
        $path = $slot === 1 ? $incidentReport->picture_1_path : $incidentReport->picture_2_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);
        return Storage::disk('local')->response($path);
    }

    public function destroy(Request $request, IncidentReport $incidentReport): JsonResponse
    {
        abort_unless(in_array($request->user()->role, self::REVIEW_ROLES, true), 403);

        Storage::disk('local')->delete(array_filter([
            $incidentReport->picture_1_path,
            $incidentReport->picture_2_path,
        ]));
        $incidentReport->delete();

        return response()->json(['success' => true]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'report_date' => ['nullable', 'date'],
            'requester_employee_id' => [$partial ? 'sometimes' : 'required', 'integer', 'exists:employees,id'],
            'classification' => ['nullable', Rule::in(['ethical', 'process_workflow', 'other'])],
            'classification_other' => ['nullable', 'required_if:classification,other', 'string', 'max:255'],
            'concerned_area_department' => ['nullable', 'string', 'max:255'],
            'description' => [$required, 'string', 'max:10000'],
            'picture_1' => ['nullable', 'image', 'max:5120'],
            'picture_2' => ['nullable', 'image', 'max:5120'],
            'needs_investigation' => ['nullable', 'boolean'],
            'investigation_notes' => ['nullable', 'string', 'max:10000'],
            'follow_up_date' => ['nullable', 'date'],
            'case_frequency_severity' => ['nullable', 'string', 'max:1000'],
            'warning_letter_required' => ['nullable', 'boolean'],
            'warning_letter_no' => ['nullable', 'required_if:warning_letter_required,1', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['submitted', 'under_investigation', 'closed'])],
            'hr_signed' => ['sometimes', 'boolean'],
            'depot_manager_signed' => ['sometimes', 'boolean'],
        ]);
    }

    private function storePictures(Request $request, array &$data, ?IncidentReport $existing = null): void
    {
        foreach ([1, 2] as $slot) {
            $key = "picture_{$slot}";
            if (! $request->hasFile($key)) continue;
            $old = $existing?->{"{$key}_path"};
            if ($old) Storage::disk('local')->delete($old);
            $data["{$key}_path"] = $request->file($key)->store('incident-reports', 'local');
        }
    }

    private function authorizeView(User $user, IncidentReport $report): void
    {
        if (in_array($user->role, self::REVIEW_ROLES, true) || (int) $report->created_by === (int) $user->id) {
            return;
        }

        $canViewRequester = $report->requesterEmployee()
            ->where(fn ($employee) => $this->scopeEmployeeVisibleTo($employee, $user))
            ->exists();
        abort_unless($canViewRequester, 403);
    }

    private function scopeEmployeeVisibleTo($query, User $user)
    {
        return $query->where(function ($employee) use ($user) {
            $employee->where('user_id', $user->id)
                ->orWhere('user_manager_id', $user->id)
                ->orWhereHas('directManager', fn ($manager) => $manager->where('user_id', $user->id))
                ->orWhereHas('user', fn ($account) => $account->where('manager_id', $user->id));
        });
    }

    private function notifyReviewers(IncidentReport $report, User $requester): void
    {
        $data = [
            'incident_report_id' => $report->id,
            'path' => '/incident-reports?report=' . $report->id,
        ];
        $options = [
            'category' => 'report',
            'priority' => 'warn',
            'sender_user_id' => $requester->id,
            'link' => $data['path'],
            'meta' => [
                ['kind' => 'code', 'value' => $report->report_no],
                ['kind' => 'area', 'value' => $report->concerned_area_department],
            ],
            'actions' => [[
                'label' => 'Open report', 'style' => 'primary', 'action' => 'open', 'payload' => [],
            ]],
            'dedupe_key' => 'incident-report-submitted-' . $report->id,
        ];
        $area = $report->concerned_area_department ? " for {$report->concerned_area_department}" : '';
        $requesterName = $report->requesterEmployee?->name ?: $requester->name;
        $body = "{$requesterName} submitted {$report->report_no}{$area}.";

        Notification::notifyRole('hr', 'incident_report_submitted', 'New Incident Report', $body, $data, true, $options);
        Notification::notifyRole('depot_manager', 'incident_report_submitted', 'New Incident Report', $body, $data, true, $options);
        Notification::notifyRole('admin', 'incident_report_submitted', 'New Incident Report', $body, $data, false, $options);
    }

    private function relations(bool $withSignatures = true): array
    {
        $columns = $withSignatures ? 'id,name,e_signature' : 'id,name';
        $employeeColumns = $withSignatures
            ? 'id,name,position,department,e_signature'
            : 'id,name,position,department';
        return [
            "requester:{$columns}", "requesterEmployee:{$employeeColumns}", "followUpUser:{$columns}",
            "hrGeneralist:{$columns}", "depotManager:{$columns}",
        ];
    }
}
