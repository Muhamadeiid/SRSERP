<?php

namespace App\Console\Commands;

use App\Services\LeaveDeductionService;
use Illuminate\Console\Command;

class ProcessLeaveDeductions extends Command
{
    protected $signature = 'leave:process-deductions';

    protected $description = 'Deduct approved leave balances once their end date has passed.';

    public function handle(LeaveDeductionService $deductions): int
    {
        $count = $deductions->processDue();
        $this->info("Processed {$count} leave deduction(s).");

        return self::SUCCESS;
    }
}
