<?php

namespace App\Services;

use App\Models\LeaveRequest;

/**
 * Overtime counts only from an approved overtime request (OTR), never from
 * punches alone. Shared by the attendance sheets and the internal salary
 * sheet so both show the same hours.
 */
class ApprovedOvertime
{
    /** OTRs that still stand: approved, or approved with a change pending. */
    public const STATUSES = ['approved', 'cancellation_pending', 'amendment_pending'];

    private const DAY_START_MINUTES = 17 * 60;
    private const NIGHT_START_MINUTES = 19 * 60;

    /**
     * Splits one approved request into whole day / night / double-pay hours.
     * On a day off or public holiday the whole request is double pay.
     *
     * @return array{start:int, end:int, day:int, night:int, double:int}|null
     *         start/end in minutes from midnight (end may pass 24:00)
     */
    public static function split(LeaveRequest $otr, bool $doublePayDay): ?array
    {
        $start = self::minutes($otr->start_time);
        $end = self::minutes($otr->end_time);
        if ($start === null || $end === null) {
            return null;
        }
        if ($end <= $start) {
            $end += 24 * 60;
        }

        $approvedHours = (int) round($otr->hours ?? (($end - $start) / 60), 0, PHP_ROUND_HALF_UP);
        if ($doublePayDay) {
            return ['start' => $start, 'end' => $end, 'day' => 0, 'night' => 0, 'double' => $approvedHours];
        }

        $dayMins = max(0, min($end, self::NIGHT_START_MINUTES) - max($start, self::DAY_START_MINUTES));
        $nightMins = max(0, $end - max($start, self::NIGHT_START_MINUTES));

        // Split the approved whole-hour total without creating fractional hours
        $dayHours = intdiv($dayMins, 60);
        $nightHours = intdiv($nightMins, 60);
        $remaining = max(0, $approvedHours - $dayHours - $nightHours);
        $dayRemainder = $dayMins % 60;
        $nightRemainder = $nightMins % 60;
        while ($remaining > 0) {
            if ($nightRemainder > $dayRemainder) {
                $nightHours++;
                $nightRemainder = -1;
            } else {
                $dayHours++;
                $dayRemainder = -1;
            }
            $remaining--;
        }

        return ['start' => $start, 'end' => $end, 'day' => $dayHours, 'night' => $nightHours, 'double' => 0];
    }

    private static function minutes($time): ?int
    {
        if (!$time) {
            return null;
        }
        $text = (string) $time;
        if (strlen($text) > 8) {
            $text = substr($text, -8);
        }

        return (int) substr($text, 0, 2) * 60 + (int) substr($text, 3, 2);
    }
}
