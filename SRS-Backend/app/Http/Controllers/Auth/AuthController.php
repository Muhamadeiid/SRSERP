<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->merge([
            'email' => strtolower(trim((string) $request->input('email'))),
        ]);

        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::whereRaw('LOWER(TRIM(email)) = ?', [$request->email])->first();
        $password = (string) $request->password;
        $passwordMatches = $user && Hash::check($password, $user->password);

        if (!$passwordMatches && $user && trim($password) !== $password) {
            $passwordMatches = Hash::check(trim($password), $user->password);
        }

        if (!$user || !$passwordMatches) {
            Log::warning('Login failed', [
                'email' => $request->email,
                'user_found' => (bool) $user,
                'ip' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Account is deactivated'], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        $user->permissions = $user->permissionsList();

        return response()->json([
            'user'  => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        $user->permissions = $user->permissionsList();
        return response()->json($user);
    }
}
