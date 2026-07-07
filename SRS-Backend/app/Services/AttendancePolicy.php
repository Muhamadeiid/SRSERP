<?php

namespace App\Services;

use App\Models\SystemSetting;

class AttendancePolicy
{
    public const DEFAULTS = [
        'attendance_regular_start_time' => '08:00',
        'attendance_regular_ot_start_time' => '17:00',
        'attendance_night_ot_start_time' => '19:00',
        'attendance_checkout_cutoff_time' => '12:00',
        'attendance_regular_expected_hours' => '9',
        'attendance_intervention_expected_hours' => '9',
        'attendance_late_grace_minutes' => '15',
        'attendance_single_punch_gap_minutes' => '30',
        'attendance_absent_deduction_minutes' => '540',
        'attendance_regular_weekly_off_day' => '5',
        'attendance_intervention_default_off_day' => '5',
        'attendance_saturday_rotation_enabled' => '1',
        'attendance_group_a_off_even_week' => '1',
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $stored = SystemSetting::whereIn('key', array_keys(self::DEFAULTS))
            ->pluck('value', 'key')
            ->all();

        return self::$cache = array_merge(self::DEFAULTS, array_filter(
            $stored,
            fn ($value) => $value !== null && $value !== ''
        ));
    }

    public static function get(string $key): string
    {
        $settings = self::all();
        return (string) ($settings[$key] ?? self::DEFAULTS[$key] ?? '');
    }

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    public static function float(string $key): float
    {
        return (float) self::get($key);
    }

    public static function bool(string $key): bool
    {
        return in_array(strtolower(self::get($key)), ['1', 'true', 'yes', 'on'], true);
    }
}
