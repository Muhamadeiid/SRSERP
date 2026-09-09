<?php

namespace App\Console\Commands;

use App\Models\MaintenanceSchedule;
use App\Models\ScheduleDayMeta;
use App\Services\MaintenanceScheduleGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class GenerateNextMaintenanceSchedule extends Command
{
    protected $signature = 'maintenance:generate-next-schedule {--force : Replace an existing next-month schedule}';

    protected $description = 'Generate the next PM schedule from saved train maintenance history.';

    public function handle(MaintenanceScheduleGenerator $generator): int
    {
        $month = now()->addMonthNoOverflow()->startOfMonth();
        $start = $month->toDateString();
        $end = $month->copy()->endOfMonth()->toDateString();
        $exists = MaintenanceSchedule::whereBetween('schedule_date', [$start, $end])->exists();
        if ($exists && !$this->option('force')) {
            $this->info("{$month->format('F Y')} already has a schedule; nothing was changed.");
            return self::SUCCESS;
        }

        $draft = $generator->preview($month->year, $month->month);
        $rows = [];
        foreach ($draft['entries'] as $date => $entries) {
            foreach ($entries as $trainId => $code) {
                $rows[] = [
                    'schedule_date' => $date,
                    'train_id' => $trainId,
                    'code' => $code,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
        }

        DB::transaction(function () use ($start, $end, $rows, $draft) {
            if ($this->option('force')) {
                MaintenanceSchedule::whereBetween('schedule_date', [$start, $end])->delete();
            }
            if ($rows) {
                MaintenanceSchedule::upsert($rows, ['schedule_date', 'train_id'], ['code', 'updated_at']);
            }
            foreach ($draft['meta'] as $date => $meta) {
                ScheduleDayMeta::updateOrCreate(['schedule_date' => $date], $meta);
            }
        });

        $this->info("Generated {$month->format('F Y')} with ".count($rows).' entries.');
        foreach ($draft['warnings'] as $warning) $this->warn($warning);
        return self::SUCCESS;
    }
}
