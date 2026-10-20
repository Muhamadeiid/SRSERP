<?php

namespace Tests\Unit;

use App\Http\Controllers\PurchaseOrderController;
use ReflectionMethod;
use Tests\TestCase;

class PurchaseOrderTaxTest extends TestCase
{
    public function test_additive_withholding_tax_is_fixed_at_fourteen_percent_of_items(): void
    {
        $method = new ReflectionMethod(PurchaseOrderController::class, 'calculateAdditiveWithholdingTax');
        $method->setAccessible(true);

        $tax = $method->invoke(new PurchaseOrderController(), [
            ['qty' => 2, 'unit_price' => 100],
            ['qty' => 3, 'unit_price' => 50.50],
            ['qty' => 1, 'unit_price' => null],
        ]);

        $this->assertSame(49.21, $tax);
    }
}
