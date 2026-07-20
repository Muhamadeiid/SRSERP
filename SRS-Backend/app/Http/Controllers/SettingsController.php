<?php
namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Models\User;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /** GET /api/settings */
    public function index(): JsonResponse
    {
        $settings = SystemSetting::all()->pluck('value', 'key');
        return response()->json(['success' => true, 'data' => $settings]);
    }

    /** POST /api/settings  body: { key, value } */
    public function update(Request $request): JsonResponse
    {
        $request->validate(['key' => 'required|string', 'value' => 'nullable|string']);
        SystemSetting::updateOrCreate(['key' => $request->key], ['value' => $request->value]);
        return response()->json(['success' => true]);
    }

    /**
     * GET /api/settings/managers
     * Employees linked to a user account flagged as a team manager. Uses the
     * explicit is_team_manager flag so Super Admins and other system-level
     * roles don't clutter the Manager Account Assignments list.
     */
    public function managers(): JsonResponse
    {
        $managers = Employee::active()->select('employees.id', 'employees.name', 'employees.arabic_name', 'employees.position', 'employees.department', 'employees.user_id', 'users.role')
            ->join('users', 'users.id', '=', 'employees.user_id')
            ->where(function ($q) {
                $q->where('users.is_team_manager', true)
                  ->orWhere('users.role', 'depot_manager');
            })
            ->where('users.is_active', true)
            ->orderBy('employees.name')
            ->get();
        return response()->json(['success' => true, 'data' => $managers]);
    }

    /** GET /api/settings/manager/{empId}/employees — employees managed by a given employee */
    public function managerEmployees(int $empId): JsonResponse
    {
        $employees = Employee::active()->where('direct_manager_id', $empId)
            ->select('id', 'name', 'arabic_name', 'ibs_code', 'department')
            ->orderBy('name')
            ->get();
        return response()->json(['success' => true, 'data' => $employees]);
    }

    /** POST /api/settings/assign  body: { employee_id, manager_id } */
    public function assignEmployee(Request $request): JsonResponse
    {
        $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'manager_id'  => 'nullable|exists:employees,id',
        ]);
        Employee::active()->where('id', $request->employee_id)
            ->update(['direct_manager_id' => $request->manager_id]);
        return response()->json(['success' => true]);
    }
}
