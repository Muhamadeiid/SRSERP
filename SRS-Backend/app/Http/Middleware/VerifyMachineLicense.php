<?php

namespace App\Http\Middleware;

use App\Support\MachineIdentity;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class VerifyMachineLicense
{
    protected const LOCK_FILE = 'app/.machine_lock';
    protected const CACHE_KEY = 'machine_license.verified';
    protected const CACHE_TTL = 300;

    public function handle(Request $request, Closure $next)
    {
        if (! config('app.machine_lock_enabled', true)) {
            return $next($request);
        }

        if ($this->isAuthorized()) {
            return $next($request);
        }

        return response()->json([
            'error'   => 'License violation',
            'message' => 'This installation is bound to a different machine. Contact your administrator.',
        ], 403);
    }

    protected function isAuthorized(): bool
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            $current = $this->computeMachineHash();
            if ($current === null) {
                return false;
            }

            $path = storage_path(self::LOCK_FILE);

            if (! file_exists($path)) {
                @mkdir(dirname($path), 0755, true);
                file_put_contents($path, $current);
                return true;
            }

            $expected = trim((string) @file_get_contents($path));

            return hash_equals($expected, $current);
        });
    }

    protected function computeMachineHash(): ?string
    {
        return MachineIdentity::hash();
    }
}
