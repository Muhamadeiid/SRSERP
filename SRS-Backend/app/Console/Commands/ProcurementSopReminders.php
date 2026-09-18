<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\ProcurementSupplier;
use App\Models\User;
use Illuminate\Console\Command;

class ProcurementSopReminders extends Command
{
    protected $signature = 'procurement:dispatch-sop-reminders';
    protected $description = 'Dispatch monthly PRF and vendor re-evaluation reminders required by the procurement SOP';

    public function handle(): int
    {
        $today = now();

        if ($today->day >= 15 && $today->day <= 20) {
            $period = $today->copy()->addMonth()->format('Y-m');
            User::where('is_active', true)->pluck('id')->each(function ($userId) use ($period) {
                Notification::notifyUser(
                    $userId,
                    'procurement_monthly_prf_reminder',
                    'Submit next month purchase requirements',
                    'Please submit required materials through the Purchase Request Form before the monthly budget is prepared.',
                    ['path' => '/purchase-request/new'],
                    false,
                    ['category' => 'report', 'dedupe_key' => "procurement-prf-reminder-{$period}"]
                );
            });
        }

        $dueSuppliers = ProcurementSupplier::whereNotNull('next_evaluation_at')
            ->where('next_evaluation_at', '<=', $today->copy()->addDays(14))
            ->whereNotIn('status', ['suspended'])
            ->get();

        foreach ($dueSuppliers as $supplier) {
            foreach (['admin', 'procurement', 'purchasing'] as $role) {
                Notification::notifyRole(
                    $role,
                    'procurement_vendor_evaluation_due',
                    'Vendor evaluation due',
                    "{$supplier->company_name} is due for performance evaluation.",
                    ['path' => '/procurement/records'],
                    false,
                    ['category' => 'report', 'priority' => 'warn', 'dedupe_key' => "vendor-evaluation-{$supplier->id}-".$supplier->next_evaluation_at->format('Y-m-d')]
                );
            }
        }

        return self::SUCCESS;
    }
}
