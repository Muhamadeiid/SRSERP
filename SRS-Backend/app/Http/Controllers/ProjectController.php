<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Project;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    /**
     * GET /api/projects
     * Active and inactive projects for Settings, augmented with live employee
     * counts using the same resolver exposed as Employee::project_code.
     */
    public function index()
    {
        $projects = Project::orderBy('sort')->orderBy('id')->get();

        $counts = [];
        Employee::select('project_budget', 'work_location')->chunk(500, function ($employees) use (&$counts) {
            foreach ($employees as $employee) {
                $code = Project::codeFor($employee->project_budget, $employee->work_location);
                $counts[$code] = ($counts[$code] ?? 0) + 1;
            }
        });

        return response()->json($projects->map(function ($project) use ($counts) {
            $project->employees_count = max(0, $counts[$project->code] ?? 0);
            return $project;
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
        $prefixCount = $project->match_prefix
            ? Employee::where('project_budget', 'like', $project->match_prefix.'%')->count()
            : 0;

        $locationCount = 0;
        foreach (Project::splitLocations($project->match_locations) as $location) {
            $locationCount += Employee::where('work_location', $location)->count();
        }

        $usedCount = $prefixCount + $locationCount;
        if ($usedCount > 0) {
            return response()->json([
                'message' => "Cannot delete: {$usedCount} employee(s) use this project. Deactivate it instead.",
            ], 422);
        }

        $project->delete();
        Project::clearCache();

        return response()->json(['message' => 'Deleted']);
    }

    private function validated(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'code' => 'sometimes|required|string|max:20',
            'name' => 'sometimes|required|string|max:100',
            'name_ar' => 'nullable|string|max:100',
            'match_prefix' => 'nullable|string|max:100',
            'match_locations' => 'nullable|string|max:1000',
            'is_default' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
            'sort' => 'nullable|integer',
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
