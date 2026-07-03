<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PermissionController extends Controller
{
    /**
     * GET /api/permissions/matrix
     * Returns { permissions: [...], roles: [...], grants: { role => [key,...] } }
     * so the Frontend can render one screen.
     */
    public function matrix()
    {
        $permissions = Permission::orderBy('group')->orderBy('key')->get();
        $roles = ['admin','depot_manager','manager','hr','staff','procurement','ehs'];
        $grants = DB::table('role_permissions')->get()
            ->groupBy('role')
            ->map(fn($rows) => $rows->pluck('permission_key')->all());

        return response()->json([
            'permissions' => $permissions,
            'roles'       => $roles,
            'grants'      => $grants,
        ]);
    }

    /**
     * POST /api/permissions/toggle  { role, permission_key, allowed }
     */
    public function toggle(Request $request)
    {
        $data = $request->validate([
            'role'           => 'required|string|max:50',
            'permission_key' => 'required|string|exists:permissions,key',
            'allowed'        => 'required|boolean',
        ]);

        if ($data['allowed']) {
            DB::table('role_permissions')->updateOrInsert(
                ['role' => $data['role'], 'permission_key' => $data['permission_key']],
                ['updated_at' => now(), 'created_at' => now()],
            );
        } else {
            DB::table('role_permissions')
                ->where('role', $data['role'])
                ->where('permission_key', $data['permission_key'])
                ->delete();
        }

        return response()->json(['ok' => true]);
    }
}
