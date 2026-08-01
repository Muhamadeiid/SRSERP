<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class PushSender
{
    // Deliver a web-push notification to every subscription registered for $userId.
    // Expired or invalidated subscriptions are removed automatically.
    public static function sendToUser(int $userId, string $title, string $body, array $data = []): void
    {
        $public = config('webpush.public_key');
        $private = config('webpush.private_key');
        if (! $public || ! $private) {
            return;
        }

        $subs = PushSubscription::where('user_id', $userId)->get();
        if ($subs->isEmpty()) {
            return;
        }

        try {
            $webpush = new WebPush([
                'VAPID' => [
                    'subject'    => config('webpush.subject'),
                    'publicKey'  => $public,
                    'privateKey' => $private,
                ],
            ], ['TTL' => config('webpush.ttl')]);
        } catch (\Throwable $e) {
            Log::warning('PushSender init failed: ' . $e->getMessage());
            return;
        }

        $payload = json_encode([
            'title' => $title,
            'body'  => $body,
            'data'  => $data,
        ]);

        foreach ($subs as $sub) {
            $subscription = Subscription::create([
                'endpoint'        => $sub->endpoint,
                'publicKey'       => $sub->p256dh_key,
                'authToken'       => $sub->auth_key,
                'contentEncoding' => 'aes128gcm',
            ]);
            $webpush->queueNotification($subscription, $payload);
        }

        foreach ($webpush->flush() as $report) {
            $endpoint = $report->getRequest()->getUri()->__toString();
            if ($report->isSuccess()) {
                continue;
            }
            // 404 / 410 mean the subscription has been unsubscribed on the client - purge it.
            if ($report->isSubscriptionExpired()) {
                PushSubscription::where('endpoint', $endpoint)->delete();
                continue;
            }
            Log::info('Push delivery failed for ' . $endpoint . ': ' . $report->getReason());
        }
    }
}
