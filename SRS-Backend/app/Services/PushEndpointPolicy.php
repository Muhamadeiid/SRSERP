<?php

namespace App\Services;

class PushEndpointPolicy
{
    public static function allows(string $endpoint): bool
    {
        $url = parse_url($endpoint);
        if (!$url || ($url['scheme'] ?? '') !== 'https' || empty($url['host'])
            || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])
            || (isset($url['port']) && $url['port'] !== 443)) {
            return false;
        }

        $host = strtolower($url['host']);
        // Browser-owned push providers only; suffixes include the DNS label boundary.
        return $host === 'fcm.googleapis.com'
            || $host === 'web.push.apple.com'
            || str_ends_with($host, '.push.services.mozilla.com')
            || str_ends_with($host, '.notify.windows.com');
    }
}
