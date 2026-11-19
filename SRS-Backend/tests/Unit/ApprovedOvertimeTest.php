<?php

namespace Tests\Unit;

use App\Models\LeaveRequest;
use App\Services\ApprovedOvertime;
use PHPUnit\Framework\TestCase;

class ApprovedOvertimeTest extends TestCase
{
    private function request(string $start, string $end, ?float $hours = null): LeaveRequest
    {
        return new LeaveRequest(['type' => 'otr', 'start_time' => $start, 'end_time' => $end, 'hours' => $hours]);
    }

    public function test_evening_overtime_splits_at_seven(): void
    {
        $split = ApprovedOvertime::split($this->request('17:00', '20:00', 3), false);

        $this->assertSame(['start' => 1020, 'end' => 1200, 'day' => 2, 'night' => 1, 'double' => 0], $split);
    }

    public function test_overtime_past_midnight_is_night(): void
    {
        $split = ApprovedOvertime::split($this->request('23:00', '04:00', 5), false);

        $this->assertSame(0, $split['day']);
        $this->assertSame(5, $split['night']);
        $this->assertSame(240, $split['end'] % 1440);
    }

    public function test_a_day_off_is_all_double_pay(): void
    {
        $split = ApprovedOvertime::split($this->request('08:00', '16:00', 8), true);

        $this->assertSame(['day' => 0, 'night' => 0, 'double' => 8], array_intersect_key($split, array_flip(['day', 'night', 'double'])));
    }

    public function test_missing_times_give_no_overtime(): void
    {
        $this->assertNull(ApprovedOvertime::split($this->request('', '20:00'), false));
    }
}
