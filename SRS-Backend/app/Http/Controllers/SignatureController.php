<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SignatureController extends Controller
{
    /**
     * POST /api/employees/{employee}/signature
     */
    public function saveEmployeeSignature(Request $request, Employee $employee): JsonResponse
    {
        $request->validate([
            'e_signature' => 'required|string|max:524288',
        ]);

        $employee->update(['e_signature' => $request->e_signature]);

        return response()->json(['success' => true, 'message' => 'Employee signature saved.']);
    }

    /**
     * POST /api/user/signature
     */
    public function saveMySignature(Request $request): JsonResponse
    {
        $request->validate([
            'e_signature' => 'required|string|max:524288',
        ]);

        auth()->user()->update(['e_signature' => $request->e_signature]);

        return response()->json(['success' => true, 'message' => 'Signature saved.']);
    }

    /**
     * GET /api/user/me
     * Returns current user with e_signature
     */
    public function me(): JsonResponse
    {
        $user = auth()->user()->load('employee');
        return response()->json(['success' => true, 'data' => $user]);
    }
}
