<?php

namespace App\Support;

use App\Models\SystemSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Offline licence for this installation.
 *
 * A licence key is "SRS1.<payload>.<signature>": a JSON payload (licensee,
 * machine, expiry) signed with the issuer's private key. It is valid only for
 * the machine it was issued to. When it ends, the API is locked until a newer
 * key is entered; no data is touched.
 *
 * Time comes from a guarded clock that only moves forward: turning the server
 * clock back does not give back licensed days. It is kept both in a file and
 * in the database, and the further-ahead copy wins.
 */
class License
{
    public const PREFIX = 'SRS1';

    private const KEY_FILE = 'app/.license';

    private const CLOCK_FILE = 'app/.license_clock';

    private const KEY_SETTING = 'license.key';

    private const CLOCK_SETTING = 'license.clock';

    private const CACHE_KEY = 'license.state';

    // A single jump forward counts for at most a week, so a clock set years
    // ahead by mistake cannot use up the licence in one go.
    private const MAX_STEP_SECONDS = 7 * 86400;

    private const WRITE_EVERY_SECONDS = 600;

    /** Licence enforcement is off in unit tests unless a test turns it on. */
    public static bool $enforceDuringTests = false;

    public static function enforced(): bool
    {
        return ! app()->runningUnitTests() || self::$enforceDuringTests;
    }

    public static function state(bool $fresh = false): array
    {
        if ($fresh) {
            Cache::forget(self::CACHE_KEY);
        }

        return Cache::remember(self::CACHE_KEY, 60, fn () => self::evaluate());
    }

    public static function locked(): bool
    {
        return self::enforced() && self::state()['locked'];
    }

    /** Checks a key and stores it if it is valid for this machine and not expired. */
    public static function activate(string $key): array
    {
        $licence = self::decode(trim($key));
        if (! $licence) {
            return ['ok' => false, 'message' => 'This licence key is not valid.'];
        }
        if ($licence['machine'] !== MachineIdentity::hash()) {
            return ['ok' => false, 'message' => 'This licence key was issued for a different server.'];
        }
        if (self::expiresAt($licence)->lt(self::now())) {
            return ['ok' => false, 'message' => 'This licence key has already expired.'];
        }

        self::storeKey(trim($key));

        return ['ok' => true, 'state' => self::state(true)];
    }

    /** Payload of a correctly signed key, or null. */
    public static function decode(string $key): ?array
    {
        $parts = explode('.', $key);
        if (count($parts) !== 3 || $parts[0] !== self::PREFIX) {
            return null;
        }
        $payload = self::base64UrlDecode($parts[1]);
        $signature = self::base64UrlDecode($parts[2]);
        if ($payload === null || $signature === null) {
            return null;
        }
        $verified = @openssl_verify($payload, $signature, (string) config('license.public_key'), OPENSSL_ALGO_SHA256);
        if ($verified !== 1) {
            return null;
        }
        $data = json_decode($payload, true);
        if (! is_array($data) || empty($data['machine']) || empty($data['expires'])) {
            return null;
        }
        try {
            Carbon::createFromFormat('Y-m-d', $data['expires']);
        } catch (Throwable) {
            return null;
        }

        return $data;
    }

    /** Signs a payload with a private key (issuer side only). */
    public static function sign(array $payload, string $privateKeyPem): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $key = openssl_pkey_get_private($privateKeyPem);
        if (! $key || ! openssl_sign($json, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('The private key could not sign the licence.');
        }

        return self::PREFIX.'.'.self::base64UrlEncode($json).'.'.self::base64UrlEncode($signature);
    }

    /** The guarded current time. */
    public static function now(): Carbon
    {
        $clock = self::readClock();
        $real = now()->getTimestamp();
        $step = $real - $clock['real'];
        $effective = $clock['effective'] + max(0, min($step, self::MAX_STEP_SECONDS));

        // Clock turned back: keep the guarded time and continue from the new reading
        if ($step < 0 || $step >= self::WRITE_EVERY_SECONDS) {
            self::writeClock(['effective' => $effective, 'real' => $real, 'since' => $clock['since']]);
        }

        return Carbon::createFromTimestamp($effective, config('app.timezone'));
    }

    private static function evaluate(): array
    {
        $now = self::now();
        $machine = MachineIdentity::hash();
        $key = self::storedKey();
        $base = ['machine_code' => $machine, 'licensee' => null, 'expires_at' => null, 'days_left' => null];

        if ($key === null) {
            $graceEnd = Carbon::createFromTimestamp(self::readClock()['since'], config('app.timezone'))
                ->addDays((int) config('license.grace_days', 14));
            $daysLeft = (int) ceil($now->diffInSeconds($graceEnd, false) / 86400);

            return $base + [
                'status' => $daysLeft > 0 ? 'trial' : 'missing',
                'locked' => $daysLeft <= 0,
                'warn' => true,
            ] + ['grace_ends_at' => $graceEnd->toDateString(), 'grace_days_left' => max(0, $daysLeft)];
        }

        $licence = self::decode($key);
        if (! $licence || $licence['machine'] !== $machine) {
            return array_merge($base, ['status' => 'invalid', 'locked' => true, 'warn' => true]);
        }

        $expiresAt = self::expiresAt($licence);
        $daysLeft = (int) ceil($now->diffInSeconds($expiresAt, false) / 86400);
        $warnDays = (int) ($licence['warn_days'] ?? config('license.warn_days', 30));

        return array_merge($base, [
            'status' => $daysLeft <= 0 ? 'expired' : ($daysLeft <= $warnDays ? 'expiring' : 'active'),
            'locked' => $daysLeft <= 0,
            'warn' => $daysLeft <= $warnDays,
            'licensee' => $licence['licensee'] ?? null,
            'expires_at' => $licence['expires'],
            'days_left' => max(0, $daysLeft),
        ]);
    }

    private static function expiresAt(array $licence): Carbon
    {
        return Carbon::createFromFormat('Y-m-d', $licence['expires'], config('app.timezone'))->endOfDay();
    }

    private static function storedKey(): ?string
    {
        $file = storage_path(self::KEY_FILE);
        $key = is_readable($file) ? trim((string) file_get_contents($file)) : '';
        if ($key === '') {
            $key = trim((string) self::setting(self::KEY_SETTING));
        }

        return $key !== '' ? $key : null;
    }

    private static function storeKey(string $key): void
    {
        @mkdir(dirname(storage_path(self::KEY_FILE)), 0755, true);
        file_put_contents(storage_path(self::KEY_FILE), $key);
        self::saveSetting(self::KEY_SETTING, $key);
    }

    /** @return array{effective:int, real:int, since:int} */
    private static function readClock(): array
    {
        $copies = [];
        $file = storage_path(self::CLOCK_FILE);
        if (is_readable($file)) {
            $copies[] = json_decode((string) file_get_contents($file), true);
        }
        $copies[] = json_decode((string) self::setting(self::CLOCK_SETTING), true);
        $copies = array_values(array_filter($copies, fn ($c) => is_array($c) && isset($c['effective'], $c['real'], $c['since'])));

        if (! $copies) {
            $now = now()->getTimestamp();
            $clock = ['effective' => $now, 'real' => $now, 'since' => $now];
            self::writeClock($clock);

            return $clock;
        }

        // The copy furthest ahead wins; the trial started at the earliest record
        usort($copies, fn ($a, $b) => $b['effective'] <=> $a['effective']);
        $clock = array_map('intval', $copies[0]);
        $clock['since'] = min(array_map(fn ($c) => (int) $c['since'], $copies));

        return $clock;
    }

    private static function writeClock(array $clock): void
    {
        $json = json_encode(array_map('intval', $clock));
        @mkdir(dirname(storage_path(self::CLOCK_FILE)), 0755, true);
        @file_put_contents(storage_path(self::CLOCK_FILE), $json);
        self::saveSetting(self::CLOCK_SETTING, $json);
    }

    private static function setting(string $key): ?string
    {
        try {
            return Schema::hasTable('system_settings') ? SystemSetting::find($key)?->value : null;
        } catch (Throwable) {
            return null;
        }
    }

    private static function saveSetting(string $key, string $value): void
    {
        try {
            if (Schema::hasTable('system_settings')) {
                SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
            }
        } catch (Throwable) {
            // the file copy still holds the value
        }
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
