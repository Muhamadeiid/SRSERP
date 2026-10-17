<?php

namespace App\Services;

use App\Models\User;

class FormSignaturePolicy
{
    public function filter(array $record, User $actor, bool $incident = false): array
    {
        if ($actor->isHR()) {
            return $record;
        }
        $clean = $this->withoutImages($record);
        if ($incident) {
            foreach (['requester', 'requester_employee'] as $key) {
                $person = $record[$key] ?? [];
                $owner = $key === 'requester' ? ($person['id'] ?? null) : ($person['user_id'] ?? null);
                if ($owner && (int) $owner === (int) $actor->id) {
                    $clean[$key]['e_signature'] = $person['e_signature'] ?? null;
                }
            }
            foreach (['hr_generalist' => 'hr_signed_at', 'depot_manager' => 'depot_manager_signed_at'] as $key => $stamp) {
                if (!empty($record[$stamp]) && isset($record[$key])) {
                    $clean[$key]['e_signature'] = $record[$key]['e_signature'] ?? null;
                }
            }
            return $clean;
        }

        foreach (['employee', 'alternate_employee'] as $key) {
            $person = $record[$key] ?? [];
            if (!empty($person['user_id']) && (int) $person['user_id'] === (int) $actor->id) {
                $clean[$key]['e_signature'] = $person['e_signature'] ?? null;
                if (isset($record['signature_parties'][$key])) {
                    $clean['signature_parties'][$key]['e_signature'] = $record['signature_parties'][$key]['e_signature'] ?? null;
                }
            }
        }
        $final = in_array($record['status'] ?? '', ['approved', 'cancellation_pending', 'amendment_pending'], true) && !empty($record['approved_at']);
        $signable = !in_array($record['status'] ?? '', ['rejected', 'cancelled'], true);
        foreach (['direct_manager' => 'manager_approved_at', 'hr' => 'hr_approved_at', 'depot_manager' => 'approved_at'] as $key => $stamp) {
            $allowed = $key === 'depot_manager' ? $final : ($signable && ($final || !empty($record[$stamp])));
            if ($allowed && isset($record['signature_parties'][$key])) {
                $clean['signature_parties'][$key]['e_signature'] = $record['signature_parties'][$key]['e_signature'] ?? null;
            }
        }
        foreach (['manager_signature' => 'manager_approved_at', 'hr_signature' => 'hr_approved_at', 'depot_signature' => 'approved_at'] as $key => $stamp) {
            if ($signable && ($final || !empty($record[$stamp]))) {
                $clean[$key] = $record[$key] ?? null;
            }
        }
        return $clean;
    }

    private function withoutImages(array $value): array
    {
        foreach ($value as $key => $item) {
            if (in_array($key, ['e_signature', 'manager_signature', 'hr_signature', 'depot_signature'], true)) {
                $value[$key] = null;
            } elseif (is_array($item)) {
                $value[$key] = $this->withoutImages($item);
            }
        }
        return $value;
    }
}
