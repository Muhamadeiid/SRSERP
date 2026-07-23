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
        $parts = array_filter([
            $this->registryValue('HKLM\SOFTWARE\Microsoft\Cryptography', 'MachineGuid'),
            $this->registryValue('HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion', 'ProductId'),
            $this->registryValue('HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion', 'InstallDate'),
            $this->registryValue('HKLM\SYSTEM\CurrentControlSet\Control\IDConfigDB\Hardware Profiles\0001', 'HwProfileGuid'),
            gethostname() ?: '',
        ], fn ($v) => $v !== '');

        if (count($parts) < 2) {
            return null;
        }

        return hash('sha256', implode('|', $parts));
    }

    protected function registryValue(string $key, string $name): string
    {
        $cmd = sprintf('reg query "%s" /v "%s" 2>NUL', $key, $name);
        $output = @shell_exec($cmd);
        if (! is_string($output)) {
            return '';
        }
        foreach (explode("\n", $output) as $line) {
            $line = trim($line);
            if (! str_starts_with($line, $name)) {
                continue;
            }
            $parts = preg_split('/\s{2,}|\t+/', $line);
            if (count($parts) >= 3) {
                return trim(end($parts));
            }
        }
        return '';
    }
}
