<?php

namespace App\Http\Middleware;

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
        $parts = [
            $this->wmicValue('csproduct get UUID /format:list'),
            $this->wmicValue('baseboard get SerialNumber /format:list'),
            $this->wmicValue('diskdrive where "MediaType=\'Fixed hard disk media\'" get SerialNumber /format:list'),
        ];

        $parts = array_filter($parts, fn ($v) => $v !== '');
        if (count($parts) < 2) {
            return null;
        }

        return hash('sha256', implode('|', $parts));
    }

    protected function wmicValue(string $query): string
    {
        $output = @shell_exec('wmic ' . $query . ' 2>NUL');
        if (! is_string($output)) {
            return '';
        }
        $lines = array_filter(array_map('trim', explode("\n", $output)));
        $values = [];
        foreach ($lines as $line) {
            if (str_contains($line, '=')) {
                [, $value] = explode('=', $line, 2);
                $value = trim($value);
                if ($value !== '' && $value !== '0') {
                    $values[] = $value;
                }
            }
        }
        return implode(',', $values);
    }
}
