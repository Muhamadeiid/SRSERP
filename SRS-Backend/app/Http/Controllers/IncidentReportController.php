<?php

namespace App\Http\Controllers;

use App\Models\IncidentReport;
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
            $query->where('created_by', $user->id);
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
                    ->orWhereHas('requester', fn ($u) => $u->where('name', 'like', "%{$term}%"));
            });
        }

        return response()->json($query->paginate(min((int) $request->get('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;
        $data['report_no'] = 'MCI-TMP-' . Str::uuid();
        $data['status'] = 'submitted';
        $this->storePictures($request, $data);

        $report = IncidentReport::create($data);
        $report->update(['report_no' => sprintf('MCI-%s-%04d', now()->format('Y'), $report->id)]);
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
        abort_unless($isReviewer || ($incidentReport->created_by === $user->id && $incidentReport->status === 'submitted'), 403);

        $data = $this->validated($request, true);
        if (! $isReviewer) {
            $data = array_intersect_key($data, array_flip([
                'report_date', 'classification', 'classification_other',
                'concerned_area_department', 'description',
            ]));
        } else {
            if (array_key_exists('hr_signed', $data)) {
                abort_unless(in_array($user->role, ['admin', 'hr'], true), 403);
                $data['hr_generalist_id'] = $data['hr_signed'] ? $user->id : null;
                $data['hr_signed_at'] = $data['hr_signed'] ? now()->toDateString() : null;
                unset($data['hr_signed']);
            }
            if (array_key_exists('depot_manager_signed', $data)) {
                abort_unless(in_array($user->role, ['admin', 'depot_manager'], true), 403);
                $data['depot_manager_id'] = $data['depot_manager_signed'] ? $user->id : null;
                $data['depot_manager_signed_at'] = $data['depot_manager_signed'] ? now()->toDateString() : null;
                unset($data['depot_manager_signed']);
            }
            if (! empty($data['needs_investigation']) && ($data['status'] ?? null) === 'submitted') {
                $data['status'] = 'under_investigation';
            }
            if (! empty($data['investigation_notes'])) {
                $data['followed_up_by'] = $user->id;
                $data['follow_up_date'] = $data['follow_up_date'] ?? now()->toDateString();
            }
        }

        $this->storePictures($request, $data, $incidentReport);
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

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'report_date' => [$required, 'date'],
            'classification' => [$required, Rule::in(['ethical', 'process_workflow', 'other'])],
            'classification_other' => ['nullable', 'required_if:classification,other', 'string', 'max:255'],
            'concerned_area_department' => [$required, 'string', 'max:255'],
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
        abort_unless(in_array($user->role, self::REVIEW_ROLES, true) || $report->created_by === $user->id, 403);
    }

    private function relations(bool $withSignatures = true): array
    {
        $columns = $withSignatures ? 'id,name,e_signature' : 'id,name';
        return [
            "requester:{$columns}", "followUpUser:{$columns}",
            "hrGeneralist:{$columns}", "depotManager:{$columns}",
        ];
    }
}
