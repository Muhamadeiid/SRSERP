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
        'annual'           => 'integer',
        'annual_remaining' => 'integer',
        'casual'           => 'integer',
        'casual_remaining' => 'integer',
        'sick'             => 'integer',
        'sick_remaining'   => 'integer',
        'early'            => 'integer',
        'early_remaining'  => 'integer',
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
    // Annual leave can overflow into Casual when exhausted (but NOT vice-versa).
    // Returns false if insufficient combined balance.
    public function deduct(string $type, int $days): bool
    {
        if (!in_array($type, ['annual', 'casual', 'sick', 'early'])) return true;

        if ($type === 'annual') {
            $annualLeft  = $this->getEffectiveRemaining('annual');
            $casualLeft  = $this->getEffectiveRemaining('casual');

            // Enough annual days alone
            if ($annualLeft >= $days) {
                $this->update(['annual_remaining' => max(0, $annualLeft - $days)]);
                return true;
            }

            // Overflow: use remaining annual + some casual
            $overflow = $days - $annualLeft;
            if ($casualLeft >= $overflow) {
                $this->update([
                    'annual_remaining' => 0,
                    'casual_remaining' => max(0, $casualLeft - $overflow),
                ]);
                return true;
            }

            return false; // Not enough even with overflow
        }

        // Casual / Sick / Early — no overflow, straight deduction
        $col     = $type . '_remaining';
        $current = $this->getEffectiveRemaining($type);

        if ($current < $days) return false;

        $this->update([$col => max(0, $current - $days)]);
        return true;
    }

    // ── Restore days back to a leave type ───────────────────────────
    // When restoring annual leave we must also restore any casual overflow used.
    public function restore(string $type, int $days): void
    {
        if (!in_array($type, ['annual', 'casual', 'sick', 'early'])) return;

        if ($type === 'annual') {
            $annualTotal  = $this->annual  ?? 14;
            $casualTotal  = $this->casual  ?? 7;
            $annualLeft   = $this->getEffectiveRemaining('annual');
            $casualLeft   = $this->getEffectiveRemaining('casual');

            $annualGap  = $annualTotal - $annualLeft;   // days missing from annual
            $restoreAnn = min($days, $annualGap);        // fill annual first
            $restoreCas = max(0, $days - $restoreAnn);   // remainder goes back to casual

            $updates = ['annual_remaining' => min($annualTotal, $annualLeft + $restoreAnn)];
            if ($restoreCas > 0) {
                $updates['casual_remaining'] = min($casualTotal, $casualLeft + $restoreCas);
            }
            $this->update($updates);
            return;
        }

        $col     = $type . '_remaining';
        $total   = $this->{$type} ?? 0;
        $current = $this->getEffectiveRemaining($type);

        $this->update([$col => min($total, $current + $days)]);
    }
}
