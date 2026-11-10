<?php

namespace App\Support;

// Stable fingerprint of the server this installation runs on. Used by the
// machine lock and by licences, which are issued for one machine.
class MachineIdentity
{
    public static function hash(): ?string
    {
        $configuredId = trim((string) config('app.machine_lock_id', ''));
        if ($configuredId !== '') {
            return hash('sha256', 'configured-machine-id|' . $configuredId);
        }

        if (PHP_OS_FAMILY === 'Windows') {
            $parts = [
                self::registryValue('HKLM\SOFTWARE\Microsoft\Cryptography', 'MachineGuid'),
                self::registryValue('HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion', 'ProductId'),
                self::registryValue('HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion', 'InstallDate'),
                self::registryValue('HKLM\SYSTEM\CurrentControlSet\Control\IDConfigDB\Hardware Profiles\0001', 'HwProfileGuid'),
                gethostname() ?: '',
            ];
        } else {
            $parts = [
                self::fileValue('/etc/machine-id'),
                self::fileValue('/sys/class/dmi/id/product_uuid'),
                gethostname() ?: '',
            ];
        }

        $parts = array_values(array_filter($parts, fn ($v) => $v !== ''));

        if (count($parts) < 2) {
            return null;
        }

        return hash('sha256', implode('|', $parts));
    }

    private static function fileValue(string $path): string
    {
        if (! is_readable($path)) {
            return '';
        }

        return trim((string) @file_get_contents($path));
    }

    private static function registryValue(string $key, string $name): string
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
