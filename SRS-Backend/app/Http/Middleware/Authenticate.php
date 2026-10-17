<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    protected function authenticate($request, array $guards)
    {
        parent::authenticate($request, $guards);

        if (!$request->user()->is_active) {
            $request->user()->tokens()->delete();
            throw new \Illuminate\Auth\AuthenticationException('Account is deactivated', $guards);
        }
    }

    /**
     * Get the path the user should be redirected to when they are not authenticated.
     */
    protected function redirectTo(Request $request): ?string
    {
        return null; // Always return JSON 401 — no login route in this API
    }
}
