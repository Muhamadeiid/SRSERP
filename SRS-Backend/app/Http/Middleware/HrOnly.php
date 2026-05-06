<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class HrOnly
{
    public function handle(Request $request, Closure $next)
    {
        if (!$request->user() || !$request->user()->isHR()) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
