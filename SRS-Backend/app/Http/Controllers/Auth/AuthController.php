<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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

    public function saveProfilePhoto(Request $request)
    {
        $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:3072'],
        ]);

        $user = $request->user();
        $oldPath = $user->profile_photo_path;
        $extension = strtolower($request->file('photo')->extension() ?: 'jpg');
        $path = $request->file('photo')->storeAs(
            'profile-photos',
            $user->id . '-' . Str::uuid() . '.' . $extension,
            'local'
        );

        abort_unless($path, 500, 'Could not save the profile photo.');
        $user->update(['profile_photo_path' => $path]);
        if ($oldPath && $oldPath !== $path) {
            Storage::disk('local')->delete($oldPath);
        }

        $user->permissions = $user->permissionsList();
        return response()->json(['message' => 'Profile photo updated.', 'user' => $user->fresh()->setAttribute('permissions', $user->permissions)]);
    }

    public function profilePhoto(Request $request): BinaryFileResponse
    {
        $path = $request->user()->profile_photo_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Cache-Control' => 'private, no-store, max-age=0',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function userProfilePhoto(User $user): BinaryFileResponse
    {
        $path = $user->profile_photo_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function deleteProfilePhoto(Request $request)
    {
        $user = $request->user();
        $path = $user->profile_photo_path;
        $user->update(['profile_photo_path' => null]);
        if ($path) Storage::disk('local')->delete($path);

        $user->permissions = $user->permissionsList();
        return response()->json(['message' => 'Profile photo removed.', 'user' => $user->fresh()->setAttribute('permissions', $user->permissions)]);
    }
}
