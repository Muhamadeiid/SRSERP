<?php

namespace App\Http\Controllers;

use App\Support\License;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LicenseController extends Controller
{
    /** GET /api/license — licence status for the lock screen and admin warnings. */
    public function status(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => License::state(true)]);
    }

    /** POST /api/license/activate — enter a new licence key. */
    public function activate(Request $request): JsonResponse
    {
        $data = $request->validate(['key' => ['required', 'string', 'max:4000']]);
        $result = License::activate($data['key']);

        if (! $result['ok']) {
            return response()->json(['success' => false, 'message' => $result['message']], 422);
        }

        return response()->json(['success' => true, 'data' => $result['state']]);
    }
}
