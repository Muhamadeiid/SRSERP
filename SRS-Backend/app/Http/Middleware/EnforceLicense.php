<?php

namespace App\Http\Middleware;

use App\Support\License;
use Closure;
use Illuminate\Http\Request;

// Without a valid licence every API call is refused (402), except the licence
// endpoints that show the status and accept a new key. Pages still load so the
// browser can show the licence screen. Nothing is deleted or changed.
class EnforceLicense
{
    public function handle(Request $request, Closure $next)
    {
        if (! $request->is('api/*') || $request->is('api/license', 'api/license/*') || ! License::locked()) {
            return $next($request);
        }

        $state = License::state();

        return response()->json([
            'success' => false,
            'license_locked' => true,
            'message' => 'The licence for this system has ended. Enter a new licence key to continue.',
            'license' => $state,
        ], 402);
    }
}
