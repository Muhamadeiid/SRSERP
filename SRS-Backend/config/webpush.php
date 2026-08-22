<?php

return [
    // Public/private VAPID keypair. Generate with:
    //   php artisan tinker
    //   > \Minishlink\WebPush\VAPID::createVapidKeys()
    // Store both values in .env and never rotate without invalidating existing subscriptions.
    'public_key'  => env('VAPID_PUBLIC_KEY'),
    'private_key' => env('VAPID_PRIVATE_KEY'),

    // Contact URL or mailto: used by push services to reach the app operator.
    'subject'     => env('VAPID_SUBJECT', 'mailto:admin@srs-egypt.local'),

    // Time in seconds a push notification is allowed to wait on the push service before delivery.
    'ttl'         => (int) env('VAPID_TTL', 60 * 60 * 24),

    // Push delivery happens after the HTTP response. Keep failures short so a
    // slow external push service cannot hold the local PHP server for long.
    'timeout'     => (int) env('VAPID_TIMEOUT', 3),
];
