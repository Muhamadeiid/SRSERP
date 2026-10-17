<?php

namespace App\Http\Middleware;

use App\Http\Controllers\IncidentReportController;
use App\Http\Controllers\LeaveRequestController;
use App\Services\FormSignaturePolicy;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProtectFormSignatures
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);
        if (!$response instanceof JsonResponse || !$request->user()) {
            return $response;
        }
        $response->headers->set('Cache-Control', 'private, no-store');
        $controller = $request->route()?->getControllerClass();
        if (!in_array($controller, [LeaveRequestController::class, IncidentReportController::class], true)) {
            return $response;
        }
        $incident = $controller === IncidentReportController::class;
        $policy = app(FormSignaturePolicy::class);
        $walk = function (array $value) use (&$walk, $policy, $request, $incident): array {
            if (($incident && isset($value['report_no'])) || (!$incident && in_array($value['type'] ?? '', ['lrf', 'otr'], true))) {
                return $policy->filter($value, $request->user(), $incident);
            }
            foreach ($value as $key => $item) {
                if (is_array($item)) $value[$key] = $walk($item);
            }
            return $value;
        };
        $response->setData($walk($response->getData(true)));
        return $response;
    }
}
