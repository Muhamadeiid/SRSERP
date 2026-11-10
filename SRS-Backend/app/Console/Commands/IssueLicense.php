<?php

namespace App\Console\Commands;

use App\Support\License;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Throwable;

// Issuer side: run on the machine that holds the private key, never on the
// customer's server.
class IssueLicense extends Command
{
    protected $signature = 'license:issue
        {--key= : Path to the private key (PEM)}
        {--machine= : Machine code shown on the licence screen}
        {--expires= : Last day of the licence, YYYY-MM-DD}
        {--licensee=Rotem SRS Egypt : Who the licence is for}
        {--warn=30 : Days before the end that admins are warned}';

    protected $description = 'Create a signed licence key for one server';

    public function handle(): int
    {
        $keyPath = (string) $this->option('key');
        $machine = strtolower(preg_replace('/[^0-9a-f]/i', '', (string) $this->option('machine')));
        $expires = (string) $this->option('expires');

        if (! is_readable($keyPath)) {
            $this->error('Private key not found: '.$keyPath);

            return self::FAILURE;
        }
        if (strlen($machine) !== 64) {
            $this->error('The machine code must be the 64-character code from the licence screen.');

            return self::FAILURE;
        }
        try {
            $date = Carbon::createFromFormat('Y-m-d', $expires);
        } catch (Throwable) {
            $date = null;
        }
        if (! $date || $date->format('Y-m-d') !== $expires) {
            $this->error('Use --expires=YYYY-MM-DD.');

            return self::FAILURE;
        }

        $key = License::sign([
            'licensee' => (string) $this->option('licensee'),
            'machine' => $machine,
            'expires' => $expires,
            'warn_days' => max(0, (int) $this->option('warn')),
            'issued' => now()->toDateString(),
        ], (string) file_get_contents($keyPath));

        $this->info("Licence for {$this->option('licensee')} until {$expires}:");
        $this->line($key);

        return self::SUCCESS;
    }
}
