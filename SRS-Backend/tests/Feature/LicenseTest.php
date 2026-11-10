<?php

namespace Tests\Feature;

use App\Support\License;
use App\Support\MachineIdentity;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LicenseTest extends TestCase
{
    // Test-only key pair; production licences use a different key
    private const TEST_PRIVATE_KEY = <<<'PEM'
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIGPTrcCUJwXMCbQG65NE2D5PatK2u5w7aYxmjv8IpjqhoAoGCCqGSM49
AwEHoUQDQgAEAVha1Y5WXsbuBDvJ9hyhyNwI+wZFtBR1cuMCHBQUahxVkHYenqbz
g4d7mgtP46GdTTaZ4BIg6r45X3sr2EiIkA==
-----END EC PRIVATE KEY-----
PEM;

    private const TEST_PUBLIC_KEY = <<<'PEM'
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAVha1Y5WXsbuBDvJ9hyhyNwI+wZF
tBR1cuMCHBQUahxVkHYenqbzg4d7mgtP46GdTTaZ4BIg6r45X3sr2EiIkA==
-----END PUBLIC KEY-----
PEM;

    private string $storage;

    protected function setUp(): void
    {
        parent::setUp();
        // Disposable database and storage: never touch the real installation
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
            'app.machine_lock_enabled' => false,
            'app.machine_lock_id' => 'licence-test-server',
            'license.public_key' => self::TEST_PUBLIC_KEY,
            'license.grace_days' => 14,
        ]);
        DB::purge('sqlite');
        Schema::create('system_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });
        $this->storage = sys_get_temp_dir().'/srs-licence-'.uniqid();
        File::makeDirectory($this->storage.'/app', 0755, true);
        File::makeDirectory($this->storage.'/framework/cache', 0755, true);
        $this->app->useStoragePath($this->storage);
        License::$enforceDuringTests = true;
        Carbon::setTestNow('2026-11-10 09:00:00');
    }

    protected function tearDown(): void
    {
        License::$enforceDuringTests = false;
        Carbon::setTestNow();
        File::deleteDirectory($this->storage);
        parent::tearDown();
    }

    private function key(string $expires, ?string $machine = null): string
    {
        return License::sign([
            'licensee' => 'Test',
            'machine' => $machine ?? MachineIdentity::hash(),
            'expires' => $expires,
            'warn_days' => 30,
        ], self::TEST_PRIVATE_KEY);
    }

    private function moveClockTo(string $to): void
    {
        Carbon::setTestNow($to);
        License::state(true);
    }

    public function test_new_installation_gets_a_grace_period_then_locks(): void
    {
        $this->getJson('/api/license')->assertOk()->assertJsonPath('data.status', 'trial');
        $this->getJson('/api/auth/me')->assertStatus(401);

        foreach (['2026-11-17', '2026-11-24', '2026-11-25'] as $day) {
            $this->moveClockTo($day.' 10:00:00');
        }

        $this->getJson('/api/auth/me')->assertStatus(402)->assertJsonPath('license_locked', true);
        $this->getJson('/api/license')->assertOk()->assertJsonPath('data.status', 'missing');
    }

    public function test_a_valid_key_unlocks_and_an_expired_licence_locks_again(): void
    {
        $this->postJson('/api/license/activate', ['key' => $this->key('2026-11-20')])
            ->assertOk()->assertJsonPath('data.status', 'expiring');
        $this->getJson('/api/auth/me')->assertStatus(401);

        foreach (['2026-11-17', '2026-11-21'] as $day) {
            $this->moveClockTo($day.' 10:00:00');
        }

        $this->getJson('/api/auth/me')->assertStatus(402)->assertJsonPath('license.status', 'expired');

        // A renewed key opens it again straight away
        $this->postJson('/api/license/activate', ['key' => $this->key('2027-12-31')])
            ->assertOk()->assertJsonPath('data.status', 'active');
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_keys_for_another_server_tampered_or_expired_are_refused(): void
    {
        $this->postJson('/api/license/activate', ['key' => $this->key('2027-12-31', str_repeat('a', 64))])
            ->assertStatus(422);

        [$prefix, $payload, $signature] = explode('.', $this->key('2027-12-31'));
        $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
        $data['expires'] = '2099-12-31';
        $forged = rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=');
        $this->postJson('/api/license/activate', ['key' => "{$prefix}.{$forged}.{$signature}"])->assertStatus(422);

        $this->postJson('/api/license/activate', ['key' => $this->key('2026-11-01')])->assertStatus(422);
        $this->getJson('/api/license')->assertJsonPath('data.status', 'trial');
    }

    public function test_turning_the_clock_back_does_not_reopen_an_expired_licence(): void
    {
        $this->postJson('/api/license/activate', ['key' => $this->key('2026-11-20')])->assertOk();
        foreach (['2026-11-17', '2026-11-24'] as $day) {
            $this->moveClockTo($day.' 10:00:00');
        }
        $this->getJson('/api/auth/me')->assertStatus(402);

        $this->moveClockTo('2026-11-12 10:00:00');
        $this->getJson('/api/auth/me')->assertStatus(402);

        // Deleting the clock file alone does not help: the database copy remains
        File::delete($this->storage.'/app/.license_clock');
        License::state(true);
        $this->getJson('/api/auth/me')->assertStatus(402);
    }

    public function test_a_clock_set_years_ahead_by_mistake_costs_at_most_a_week(): void
    {
        $this->postJson('/api/license/activate', ['key' => $this->key('2026-12-31')])->assertOk();

        $this->moveClockTo('2031-01-01 10:00:00');
        $this->moveClockTo('2026-11-10 12:00:00');

        $this->getJson('/api/auth/me')->assertStatus(401);
        $this->assertLessThanOrEqual(7, License::now()->diffInDays(Carbon::parse('2026-11-10 12:00:00')));
    }
}
