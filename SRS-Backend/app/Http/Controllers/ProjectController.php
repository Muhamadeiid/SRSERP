<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    /**
     * GET /api/projects
     * Active projects for pickers, augmented with a live employee count
     * (how many employees resolve to each code today).
     */
    public function index()
    {
        $projects = Project::orderBy('sort')->orderBy('id')->get();

        // Compute employee counts per code without materialising every row.
        $counts = [];
        foreach ($projects as $p) {
            $counts[$p->code] = ($counts[$p->code] ?? 0);
            if ($p->match_prefix) {
                $counts[$p->code] += Employee::where('project_budget', 'like', $p->match_prefix.'%')->count();
            }
        }
        // Anything unmatched → falls into the default project.
        $default = $projects->firstWhere('is_default', true);
        if ($default) {
            $matchedIds = $projects->whereNotNull('match_prefix')->pluck('match_prefix')->all();
            $unmatchedCount = Employee::where(function ($q) use ($matchedIds) {
                foreach ($matchedIds as $prefix) {
                    $q->where('project_budget', 'not like', $prefix.'%');
                }
                $q->orWhereNull('project_budget');
            })->count();

            $counts[$default->code] = ($counts[$default->code] ?? 0) + $unmatchedCount
                - ($default->match_prefix ? Employee::where('project_budget', 'like', $default->match_prefix.'%')->count() : 0);
        }

        return response()->json($projects->map(function ($p) use ($counts) {
            $p->employees_count = max(0, $counts[$p->code] ?? 0);
            return $p;
        }));
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->normalize($data);

        $project = Project::create($data);
        Project::clearCache();
        return response()->json($project, 201);
    }

    public function update(Request $request, Project $project)
    {
        $data = $this->validated($request, $project->id);
        $this->normalize($data);

        $project->update($data);
        Project::clearCache();
        return response()->json($project);
    }

    public function destroy(Project $project)
    {
        // Refuse if any employee currently resolves to this project — safer
        // than silently reassigning them.
        $prefixCount = $project->match_prefix
            ? Employee::where('project_budget', 'like', $project->match_prefix.'%')->count()
            : 0;
        if ($prefixCount > 0) {
            return response()->json([
                'message' => "Cannot delete: {$prefixCount} employee(s) use this project's budget prefix. Deactivate it instead.",
            ], 422);
        }

        $project->delete();
        Project::clearCache();
        return response()->json(['message' => 'Deleted']);
    }

    private function validated(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'code'         => 'sometimes|required|string|max:20',
            'name'         => 'sometimes|required|string|max:100',
            'name_ar'      => 'nullable|string|max:100',
            'match_prefix' => 'nullable|string|max:100',
            'is_default'   => 'nullable|boolean',
            'is_active'    => 'nullable|boolean',
            'sort'         => 'nullable|integer',
        ]);
    }

    /**
     * Only one project can be the default. If this one is being set as default,
     * clear the flag on every other row.
     */
    private function normalize(array &$data): void
    {
        if (!empty($data['is_default'])) {
            Project::where('is_default', true)->update(['is_default' => false]);
        }
    }
}
