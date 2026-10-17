<?php

namespace Tests\Unit;

use App\Services\PushEndpointPolicy;
use PHPUnit\Framework\TestCase;

class PushEndpointPolicyTest extends TestCase
{
    public function test_only_https_browser_push_providers_are_allowed(): void
    {
        foreach (['https://fcm.googleapis.com/fcm/send/token', 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://web.push.apple.com/token', 'https://wns2.notify.windows.com/token'] as $url) {
            $this->assertTrue(PushEndpointPolicy::allows($url), $url);
        }
        foreach (['http://fcm.googleapis.com/token', 'https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/', 'https://fcm.googleapis.com.evil.test/', 'https://evilpush.services.mozilla.com/', 'https://user:pass@fcm.googleapis.com/', 'https://fcm.googleapis.com:8443/', 'https://fcm.googleapis.com/#fragment', 'file:///etc/passwd'] as $url) {
            $this->assertFalse(PushEndpointPolicy::allows($url), $url);
        }
    }
}
