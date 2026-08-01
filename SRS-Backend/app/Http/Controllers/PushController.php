<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushController extends Controller
{
    // Public VAPID key for the frontend to build a PushSubscription with.
    public function publicKey(): JsonResponse
    {
        return response()->json([
            'public_key' => config('webpush.public_key'),
        ]);
    }

    // Persist a browser push subscription for the current user. Idempotent by endpoint.
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint'   => ['required', 'string', 'max:500'],
            'p256dh_key' => ['required', 'string', 'max:200'],
            'auth_key'   => ['required', 'string', 'max:100'],
            'user_agent' => ['nullable', 'string', 'max:300'],
        ]);

        $subscription = PushSubscription::updateOrCreate(
            ['endpoint' => $data['endpoint']],
            [
                'user_id'    => $request->user()->id,
                'p256dh_key' => $data['p256dh_key'],
                'auth_key'   => $data['auth_key'],
                'user_agent' => $data['user_agent'] ?? substr((string) $request->userAgent(), 0, 300),
            ]
        );

        return response()->json(['id' => $subscription->id], 201);
    }

    // Remove a browser push subscription. Called when the client unsubscribes.
    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:500'],
        ]);

        PushSubscription::where('endpoint', $data['endpoint'])
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['ok' => true]);
    }
}
