<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index()
    {
        $users = User::with('manager:id,name')->get();

        // Attach the linked employee record (name, position) for each user
        $empByUserId = Employee::active()->whereIn('user_id', $users->pluck('id'))
            ->select('id', 'name', 'position', 'department', 'user_id')
            ->get()
            ->keyBy('user_id');

        $users->each(function ($u) use ($empByUserId) {
            $u->setAttribute('linked_employee', $empByUserId->get($u->id));
        });

        return response()->json($users);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'            => 'required|string|max:255',
            'email'           => 'required|email|unique:users',
            'password'        => 'required|string|min:8',
            'role'            => 'required|in:admin,depot_manager,manager,staff,hr,procurement,ehs',
            'department'      => 'required|in:cm,hm,pm,warranty,cm_intervention,admin',
            'manager_id'      => 'nullable|exists:users,id',
            'is_team_manager' => 'sometimes|boolean',
        ]);

        // Prevent self-assignment (no id yet on create, so nothing to check)
        $data['password'] = Hash::make($data['password']);
        $user = User::create($data);

        return response()->json($user->load('manager:id,name'), 201);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name'            => 'sometimes|string|max:255',
            'email'           => 'sometimes|email|unique:users,email,' . $user->id,
            'role'            => 'sometimes|in:admin,depot_manager,manager,staff,hr,procurement,ehs',
            'department'      => 'sometimes|in:cm,hm,pm,warranty,cm_intervention,admin',
            'is_active'       => 'sometimes|boolean',
            'is_team_manager' => 'sometimes|boolean',
            'manager_id'      => 'nullable|exists:users,id',
        ]);

        // Prevent a user from assigning themselves as their own manager
        if (isset($data['manager_id']) && (int) $data['manager_id'] === $user->id) {
            return response()->json(['message' => 'A user cannot be their own manager.'], 422);
        }

        $user->update($data);

        return response()->json($user->load('manager:id,name'));
    }

    /**
     * GET /api/users/subordinates
     * Returns all users whose manager_id = the authenticated user.
     */
    public function subordinates(Request $request)
    {
        $subs = User::where('manager_id', $request->user()->id)
            ->with('manager:id,name')
            ->get();

        return response()->json($subs);
    }

    /**
     * GET /api/users/managers
     * Returns all user accounts with a managerial role, with their assigned employee count.
     */
    public function managers()
    {
        // Filter by the explicit is_team_manager flag so system-level roles
        // (admin, procurement, ehs) don't clutter Manager Account Assignments.
        // Anyone flagged, plus depot_manager as a safety net, is included.
        $managers = User::where(function ($q) {
                $q->where('is_team_manager', true)
                  ->orWhere('role', 'depot_manager');
            })
            ->where('is_active', true)
            ->withCount(['assignedEmployees' => fn ($q) => $q->active()])
            ->orderByRaw("FIELD(role, 'depot_manager', 'manager', 'hr', 'admin')")
            ->get(['id', 'name', 'email', 'role', 'department', 'is_team_manager']);

        return response()->json($managers);
    }

    /**
     * GET /api/users/depot-manager
     * Returns the depot manager (public — any authenticated user).
     * Used by resignation / leave / OT forms to auto-fill the depot manager name.
     */
    public function depotManager()
    {
        $dm = User::where('role', 'depot_manager')
            ->where('is_active', true)
            ->first(['id', 'name', 'email', 'role', 'e_signature']);

        if ($dm) {
            $employee = Employee::active()->where('user_id', $dm->id)->first(['name', 'e_signature']);
            if ($employee) {
                $dm->setAttribute('name', $employee->name ?: $dm->name);
                $dm->setAttribute('e_signature', $employee->e_signature ?: $dm->e_signature);
            }
        }

        return response()->json($dm);
    }

    /**
     * GET /api/users/hr-officer
     * Returns the HR representative (any active Human Resources user).
     * Public — any authenticated user.
     */
    public function hrOfficer()
    {
        $hr = User::where('role', 'hr')
            ->where('is_active', true)
            ->first(['id', 'name', 'email', 'role', 'e_signature']);

        if ($hr) {
            $employee = Employee::active()->where('user_id', $hr->id)->first(['name', 'e_signature']);
            if ($employee) {
                $hr->setAttribute('name', $employee->name ?: $hr->name);
                $hr->setAttribute('e_signature', $employee->e_signature ?: $hr->e_signature);
            }
        }

        return response()->json($hr);
    }

    /**
     * GET /api/users/{user}/assigned-employees
     * Returns all employees assigned to this manager user.
     */
    public function assignedEmployees(User $user)
    {
        $employees = Employee::active()->where('user_manager_id', $user->id)
            ->orderBy('name')
            ->get(['id', 'name', 'ibs_code', 'position', 'department', 'user_manager_id']);

        return response()->json($employees);
    }

    /**
     * POST /api/users/{user}/link-employee
     * Link a user account to an employee record (sets employees.user_id = user.id).
     * Body: { employee_id } — pass null to unlink.
     */
    public function linkEmployee(Request $request, User $user)
    {
        $data = $request->validate([
            'employee_id' => 'nullable|exists:employees,id',
        ]);

        // Clear previous link if any
        Employee::where('user_id', $user->id)->update(['user_id' => null]);

        if ($data['employee_id']) {
            Employee::active()->where('id', $data['employee_id'])->update(['user_id' => $user->id]);
        }

        $linked = $data['employee_id']
            ? Employee::active()->where('id', $data['employee_id'])->select('id', 'name', 'position', 'department')->first()
            : null;

        return response()->json(['success' => true, 'linked_employee' => $linked]);
    }

    /**
     * POST /api/users/{user}/assign-employee
     * Assign or unassign an employee to/from this manager user.
     * Body: { employee_id, assign: true|false }
     */
    public function assignEmployee(Request $request, User $user)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'assign'      => 'required|boolean',
        ]);

        Employee::active()->where('id', $data['employee_id'])
            ->update(['user_manager_id' => $data['assign'] ? $user->id : null]);

        return response()->json(['success' => true]);
    }

    public function resetPassword(Request $request, User $user)
    {
        $request->validate([
            'password'              => 'required|string|min:8|confirmed',
            'password_confirmation' => 'required',
        ]);

        $user->update(['password' => Hash::make($request->password)]);

        return response()->json(['message' => 'Password reset successfully']);
    }

    public function destroy(User $user)
    {
        if ($user->id === request()->user()->id) {
            return response()->json(['message' => 'Cannot delete your own account'], 422);
        }

        $user->delete();
        return response()->json(['message' => 'User deleted']);
    }

    /**
     * POST /api/users/{user}/signature
     * Admin sets e_signature for any user
     */
    public function saveSignature(Request $request, User $user)
    {
        $request->validate([
            'e_signature' => 'required|string|max:524288',
        ]);

        $user->update(['e_signature' => $request->e_signature]);

        return response()->json(['success' => true, 'message' => 'Signature saved.', 'data' => $user]);
    }
}
