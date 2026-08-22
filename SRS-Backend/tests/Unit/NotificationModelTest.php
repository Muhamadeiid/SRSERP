<?php

namespace Tests\Unit;

use App\Models\Notification;
use App\Models\NotificationPreference;
use PHPUnit\Framework\TestCase;

class NotificationModelTest extends TestCase
{
    public function test_legacy_types_map_to_notification_center_categories(): void
    {
        $this->assertSame('leave', Notification::categoryForType('leave_request_submitted'));
        $this->assertSame('leave', Notification::categoryForType('lrf_manager_approved'));
        $this->assertSame('ot', Notification::categoryForType('overtime_approved'));
        $this->assertSame('task', Notification::categoryForType('maintenance_task_assigned'));
        $this->assertSame('meeting', Notification::categoryForType('meeting_rescheduled'));
        $this->assertSame('hr', Notification::categoryForType('resignation_approved'));
        $this->assertSame('report', Notification::categoryForType('prf_approved'));
        $this->assertSame('crit', Notification::categoryForType('critical_incident'));
        $this->assertSame('sys', Notification::categoryForType('unknown_event'));
    }

    public function test_default_preferences_enable_only_in_app_delivery(): void
    {
        $channels = NotificationPreference::defaultChannels();

        $this->assertSame(NotificationPreference::CATEGORIES, array_keys($channels));
        foreach ($channels as $channel) {
            $this->assertTrue($channel['in_app']);
            $this->assertFalse($channel['email']);
            $this->assertFalse($channel['whatsapp']);
        }
    }
}
