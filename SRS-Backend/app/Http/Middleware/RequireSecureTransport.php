<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RequireSecureTransport
{
    public function handle(Request $request, Closure $next)
    {
        if (config('srs.require_https') && (!$request->isSecure() || config('app.debug'))) {
            return response()->json(['message' => 'Secure production transport is not configured'], 503);
        }
        return $next($request);
    }
}
