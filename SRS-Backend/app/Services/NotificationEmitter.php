<?php

namespace App\Services;

use App\Models\Notification;

class NotificationEmitter
{
    /**
     * Ready for the future CCP incident controller. It accepts only persisted
     * incident identifiers and explicit crew recipients; it never fabricates data.
     */
    public function criticalIncidentSubmitted(
        int $incidentId,
        string $trainCode,
        string $summary,
        int $senderUserId,
        array $crewUserIds = []
    ): void {
        $data = ['incident_id' => $incidentId, 'train_code' => $trainCode, 'path' => '/ccp/incidents'];
        $options = [
            'category' => 'crit',
            'priority' => 'crit',
            'sender_user_id' => $senderUserId,
            'link' => '/ccp/incidents?incident=' . $incidentId,
            'meta' => [['kind' => 'code', 'value' => $trainCode]],
            'actions' => [['label' => 'Open incident', 'style' => 'primary', 'action' => 'open', 'payload' => []]],
        ];

        Notification::notifyRole('depot_manager', 'ccp_incident_submitted', 'Critical incident reported', $summary, $data, true, $options);
        Notification::notifyRole('site_manager', 'ccp_incident_submitted', 'Critical incident reported', $summary, $data, true, $options);
        foreach (array_unique(array_map('intval', $crewUserIds)) as $userId) {
            if ($userId > 0) Notification::notifyUser($userId, 'ccp_incident_submitted', 'Critical incident reported', $summary, $data, true, $options);
        }

        // TODO: invoke this from the CCP incident transaction after that module is added.
        // Pattern detection (3 incidents/24h) and MTBF alerts need the future incident schema.
    }
}
