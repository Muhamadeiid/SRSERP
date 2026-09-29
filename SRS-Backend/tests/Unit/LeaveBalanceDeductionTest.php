<?php

namespace Tests\Unit;

use App\Models\LeaveBalance;
use PHPUnit\Framework\TestCase;

class LeaveBalanceDeductionTest extends TestCase
{
    private function balance(array $attributes): LeaveBalance
    {
        return new class($attributes) extends LeaveBalance
        {
            public function update(array $attributes = [], array $options = []): bool
            {
                $this->fill($attributes);

                return true;
            }
        };
    }

    public function test_casual_leave_deducts_from_total_and_casual_remaining(): void
    {
        $balance = $this->balance([
            'annual' => 21,
            'annual_remaining' => 21,
            'casual' => 7,
            'casual_remaining' => 7,
        ]);

        $this->assertTrue($balance->deduct('casual', 1));
        $this->assertSame(20.0, $balance->getEffectiveRemaining('annual'));
        $this->assertSame(6.0, $balance->getEffectiveRemaining('casual'));
    }

    public function test_casual_permission_still_deducts_both_balances_after_annual_portion_is_used(): void
    {
        $balance = $this->balance([
            'annual' => 21,
            'annual_remaining' => 21,
            'casual' => 7,
            'casual_remaining' => 7,
        ]);

        $this->assertTrue($balance->deduct('annual', 14));
        $this->assertTrue($balance->deduct('casual', 0.25));
        $this->assertSame(6.75, $balance->getEffectiveRemaining('annual'));
        $this->assertSame(6.75, $balance->getEffectiveRemaining('casual'));
    }
}
