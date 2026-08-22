<?php

namespace Database\Seeders;

use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Database\Seeder;

class NotificationSeeder extends Seeder
{
    public function run(): void
    {
        $recipient = User::where('is_active', true)->orderByRaw("role = 'admin' desc")->first();
        if (! $recipient) {
            return;
        }

        $samples = [
            ['crit', 'crit', 'Critical incident reported', 'A new CCP incident requires immediate review.'],
            ['task', 'warn', 'Task assigned to you', 'Inspect the propulsion system before the due date.'],
            ['meeting', 'info', 'Maintenance meeting invite', 'Weekly coordination meeting has been scheduled.'],
            ['hr', 'info', 'Interview scheduled', 'An interview was assigned to your calendar.'],
            ['leave', 'warn', 'Leave request awaiting approval', 'A leave request requires your decision.'],
            ['ot', 'warn', 'Overtime request awaiting approval', 'An overtime request requires your decision.'],
            ['report', 'info', 'Monthly report is ready', 'The generated report is ready for review.'],
            ['sys', 'info', 'Notification center enabled', 'Your notification preferences are ready.'],
        ];

        foreach ($samples as $index => [$category, $priority, $title, $description]) {
            Notification::updateOrCreate(
                ['user_id' => $recipient->id, 'type' => "sample_{$category}"],
                [
                    'category' => $category,
                    'priority' => $priority,
                    'title' => $title,
                    'body' => $description,
                    'description' => $description,
                    'sender_icon' => $category === 'sys' ? 'SYS' : null,
                    'data' => ['sample' => true],
                    'meta' => [['kind' => 'tag', 'value' => 'Sample']],
                    'actions' => $index === 4
                        ? [['label' => 'Open', 'style' => 'primary', 'action' => 'open', 'payload' => []]]
                        : [],
                    'read' => false,
                    'read_at' => null,
                    'dismissed_at' => null,
                ]
            );
        }

        NotificationPreference::firstOrCreate(
            ['user_id' => $recipient->id],
            ['channels' => NotificationPreference::defaultChannels()]
        );
    }
}
