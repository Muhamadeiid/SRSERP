<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveBalance extends Model
{
    protected $fillable = [
        'employee_id',
        'annual',  'annual_remaining',
        'casual',  'casual_remaining',
        'sick',    'sick_remaining',
        'early',   'early_remaining',
    ];

    protected $casts = [
        'annual'           => 'decimal:2',
        'annual_remaining' => 'decimal:2',
        'casual'           => 'decimal:2',
        'casual_remaining' => 'decimal:2',
        'sick'             => 'decimal:2',
        'sick_remaining'   => 'decimal:2',
        'early'            => 'decimal:2',
        'early_remaining'  => 'decimal:2',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    // ── Remaining getters (fall back to total if no remaining stored) ─
    public function getEffectiveRemaining(string $type): int
    {
        $remaining = $this->{$type . '_remaining'};
        return $remaining !== null ? $remaining : ($this->{$type} ?? 0);
    }

    // ── Deduct days from a leave type ────────────────────────────────
    // Annual pool = 21 days. Casual is a sub-limit (max 7) drawn from that pool.
    // Taking annual  → deducts from annual pool only.
    // Taking casual  → deducts from annual pool AND casual sub-limit.
    // Returns false if insufficient balance or sub-limit exceeded.
    public function deduct(string $type, float $days): bool
    {
        if (!in_array($type, ['annual', 'casual', 'sick', 'early'])) return true;

        if ($type === 'annual') {
            $annualLeft = $this->getEffectiveRemaining('annual');
            if ($annualLeft < $days) return false;
            $this->update(['annual_remaining' => $annualLeft - $days]);
            return true;
        }

        if ($type === 'casual') {
            $annualLeft = $this->getEffectiveRemaining('annual');
            $casualLeft = $this->getEffectiveRemaining('casual');
            // Must have room in both the annual pool and the casual sub-limit
            if ($annualLeft < $days || $casualLeft < $days) return false;
            $this->update([
                'annual_remaining' => $annualLeft - $days,
                'casual_remaining' => $casualLeft - $days,
            ]);
            return true;
        }

        // Sick / Early — independent balance
        $current = $this->getEffectiveRemaining($type);
        if ($current < $days) return false;
        $this->update([$type . '_remaining' => max(0, $current - $days)]);
        return true;
    }

    // ── Restore days back to a leave type ───────────────────────────
    public function restore(string $type, float $days): void
    {
        if (!in_array($type, ['annual', 'casual', 'sick', 'early'])) return;

        if ($type === 'annual') {
            $annualTotal = $this->annual ?? 21;
            $annualLeft  = $this->getEffectiveRemaining('annual');
            $this->update(['annual_remaining' => min($annualTotal, $annualLeft + $days)]);
            return;
        }

        if ($type === 'casual') {
            $annualTotal = $this->annual ?? 21;
            $casualTotal = $this->casual ?? 7;
            $annualLeft  = $this->getEffectiveRemaining('annual');
            $casualLeft  = $this->getEffectiveRemaining('casual');
            $this->update([
                'annual_remaining' => min($annualTotal, $annualLeft + $days),
                'casual_remaining' => min($casualTotal, $casualLeft + $days),
            ]);
            return;
        }

        $total   = $this->{$type} ?? 0;
        $current = $this->getEffectiveRemaining($type);
        $this->update([$type . '_remaining' => min($total, $current + $days)]);
    }
}
