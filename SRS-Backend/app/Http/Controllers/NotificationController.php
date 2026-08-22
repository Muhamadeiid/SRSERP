<?php

namespace App\Http\Controllers;

use App\Models\LeaveRequest;
use App\Models\Notification;
use App\Models\NotificationPreference;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tab' => ['sometimes', Rule::in(array_unique(['all', 'unread', 'assigned', ...Notification::CATEGORIES]))],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'before' => ['sometimes', 'date'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $tab = $validated['tab'] ?? 'all';
        $limit = (int) ($validated['limit'] ?? 50);
        $base = Notification::query()
            ->where('user_id', $request->user()->id)
            ->visible();

        $query = clone $base;
        if ($tab === 'unread') {
            $query->unread();
        } elseif ($tab === 'assigned') {
            $query->where(function ($assigned) {
                $assigned->where('category', 'task')
                    ->orWhere('type', 'like', '%assigned%')
                    ->orWhere('type', 'like', 'calendar_task_%')
                    ->orWhere('type', 'like', 'maintenance_task_%');
            });
        } elseif ($tab === 'leave') {
            $query->where(function ($requestQuery) {
                $requestQuery->where(function ($storedCategory) {
                    $storedCategory->where('category', 'leave')
                        ->where('type', 'not like', '%otr%')
                        ->where('type', 'not like', '%overtime%');
                })
                    ->orWhere('type', 'like', '%lrf%')
                    ->orWhere('type', 'like', '%leave%');
            });
        } elseif ($tab === 'ot') {
            $query->where(function ($requestQuery) {
                $requestQuery->where('category', 'ot')
                    ->orWhere('type', 'like', '%otr%')
                    ->orWhere('type', 'like', '%overtime%');
            });
        } elseif (in_array($tab, Notification::CATEGORIES, true)) {
            $query->where('category', $tab);
        }

        if (! empty($validated['before'])) {
            $query->where('created_at', '<', Carbon::parse($validated['before']));
        }

        if ($search = trim($validated['search'] ?? '')) {
            $query->where(function ($searchQuery) use ($search) {
                $term = '%'.addcslashes($search, '%_\\').'%';
                $searchQuery->where('title', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    ->orWhere('body', 'like', $term)
                    ->orWhere('type', 'like', $term);
            });
        }

        $notifications = $query->with('sender:id,name,profile_photo_path')
            ->latest('created_at')
            ->limit($limit + 1)
            ->get();
        $hasMore = $notifications->count() > $limit;
        $items = $notifications->take($limit)->values();
        $this->appendLeaveRequestTypes($items);
        $this->normalizeRequestNotifications($items);

        $unreadCount = (clone $base)->unread()->count();
        $criticalCount = (clone $base)->unread()->where('priority', 'crit')->count();

        return response()->json([
            'success' => true,
            'items' => $items,
            'hasMore' => $hasMore,
            'unreadCount' => $unreadCount,
            'criticalCount' => $criticalCount,
            // Legacy aliases keep the current bells working until the shared component lands.
            'data' => $items,
            'unread_count' => $unreadCount,
        ]);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        $notification = $this->owned($request, $notification);
        $notification->markAsRead();

        return response()->json(['success' => true, 'data' => $notification->fresh()]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $now = now();
        $count = Notification::where('user_id', $request->user()->id)
            ->visible()
            ->unread()
            ->update(['read' => true, 'read_at' => $now, 'updated_at' => $now]);

        return response()->json(['success' => true, 'updated' => $count]);
    }

    public function destroy(Request $request, Notification $notification): JsonResponse
    {
        $notification = $this->owned($request, $notification);
        $notification->dismiss();

        return response()->json(['success' => true]);
    }

    public function preferences(Request $request): JsonResponse
    {
        $preferences = NotificationPreference::forUser($request->user()->id)->refresh();

        return response()->json(['success' => true, 'data' => $preferences]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'dndEnabled' => ['sometimes', 'boolean'],
            'dndUntil' => ['nullable', 'date'],
            'channels' => ['sometimes', 'array'],
            'channels.*' => ['array'],
            'channels.*.in_app' => ['required_with:channels', 'boolean'],
            'channels.*.email' => ['required_with:channels', 'boolean'],
            'channels.*.whatsapp' => ['required_with:channels', 'boolean'],
        ]);

        if (isset($validated['channels'])) {
            $unknown = array_diff(array_keys($validated['channels']), NotificationPreference::CATEGORIES);
            abort_if($unknown !== [], 422, 'Unknown notification category.');
        }

        $preferences = NotificationPreference::firstOrNew(['user_id' => $request->user()->id]);
        $preferences->dnd_enabled = $validated['dndEnabled'] ?? $preferences->dnd_enabled ?? false;
        if (array_key_exists('dndUntil', $validated)) {
            $preferences->dnd_until = $validated['dndUntil'];
        }
        if (! $preferences->dnd_enabled) {
            $preferences->dnd_until = null;
        }
        // Merge partial channels into existing so a single-category toggle doesn't wipe
        // the other categories' saved preferences.
        $currentChannels = $preferences->channels ?? NotificationPreference::defaultChannels();
        $preferences->channels = array_merge($currentChannels, $validated['channels'] ?? []);
        $preferences->save();

        return response()->json(['success' => true, 'data' => $preferences->fresh()]);
    }

    public function action(Request $request, Notification $notification): JsonResponse
    {
        $notification = $this->owned($request, $notification);
        $validated = $request->validate([
            'action' => ['required', Rule::in(['accept', 'decline', 'open', 'custom'])],
            'payload' => ['sometimes', 'array'],
            'payload.reason' => ['required_if:action,decline', 'string', 'min:5', 'max:1000'],
        ]);
        $action = $validated['action'];
        $payload = $validated['payload'] ?? [];

        if ($action === 'open') {
            $notification->markAsRead();
            return response()->json(['success' => true, 'data' => $notification->fresh()]);
        }

        $leaveRequestId = $payload['leave_request_id'] ?? $notification->data['leave_request_id'] ?? null;
        abort_unless($leaveRequestId && in_array($notification->category, ['leave', 'ot'], true), 422, 'This action is not supported yet.');

        $leaveRequest = LeaveRequest::findOrFail($leaveRequestId);
        $domainRequest = Request::create('/', 'POST', $payload);
        $domainRequest->setUserResolver(fn () => $request->user());
        if ($action === 'decline') {
            $domainRequest->merge(['reason' => $payload['reason']]);
        }

        $controller = app(LeaveRequestController::class);
        $response = DB::transaction(function () use ($action, $controller, $domainRequest, $leaveRequest) {
            if ($action === 'decline') {
                return $controller->reject($domainRequest, $leaveRequest);
            }

            return match ($leaveRequest->status) {
                'pending' => $controller->managerApprove($domainRequest, $leaveRequest),
                'manager_approved' => $controller->hrApprove($domainRequest, $leaveRequest),
                'hr_approved' => $controller->approve($domainRequest, $leaveRequest),
                default => response()->json(['success' => false, 'message' => 'Request is not awaiting approval'], 422),
            };
        });

        if ($response->isSuccessful()) {
            $notification->markAsRead();
        }

        return response()->json([
            'success' => $response->isSuccessful(),
            'notification' => $notification->fresh(),
            'sideEffects' => $response->getData(true),
        ], $response->status());
    }

    private function owned(Request $request, Notification $notification): Notification
    {
        abort_unless($notification->user_id === $request->user()->id, 404);
        abort_if($notification->dismissed_at, 404);

        return $notification;
    }

    private function appendLeaveRequestTypes($notifications): void
    {
        $requestIds = $notifications->pluck('data')
            ->map(fn ($data) => $data['leave_request_id'] ?? null)
            ->filter()->unique();
        $requestTypes = LeaveRequest::whereIn('id', $requestIds)->pluck('type', 'id');

        $notifications->each(function (Notification $notification) use ($requestTypes) {
            $data = is_array($notification->data) ? $notification->data : [];
            $requestId = $data['leave_request_id'] ?? null;
            if ($requestId && ! isset($data['request_type']) && isset($requestTypes[$requestId])) {
                $data['request_type'] = $requestTypes[$requestId];
                $notification->setAttribute('data', $data);
            }
        });
    }

    private function normalizeRequestNotifications($notifications): void
    {
        $notifications->each(function (Notification $notification) {
            $data = is_array($notification->data) ? $notification->data : [];
            $requestType = strtolower((string) ($data['request_type'] ?? ''));
            $category = in_array($requestType, ['lrf', 'otr'], true)
                ? ($requestType === 'otr' ? 'ot' : 'leave')
                : Notification::categoryForType($notification->type);

            if (in_array($category, ['leave', 'ot'], true)) {
                $notification->setAttribute('category', $category);
                if (isset($data['leave_request_id'])) {
                    $path = $category === 'ot'
                        ? '/human-resources/overtime?request='
                        : '/human-resources/leave-requests?request=';
                    $notification->setAttribute('link', $path.$data['leave_request_id']);
                }
            }

            if (Notification::priorityForType($notification->type) === 'warn') {
                $notification->setAttribute('priority', 'warn');
            }
        });
    }
}
