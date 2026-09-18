<?php

namespace Tests\Unit;

use App\Services\ProcurementSopPolicy;
use Illuminate\Support\Collection;
use Tests\TestCase;

class ProcurementSopPolicyTest extends TestCase
{
    public function test_direct_order_category_accepts_configured_labels_and_codes(): void
    {
        $allowed = ['STAT', 'Office Supplies', 'Transport'];

        $this->assertTrue(ProcurementSopPolicy::directOrderCategoryAllowed('STAT', $allowed));
        $this->assertTrue(ProcurementSopPolicy::directOrderCategoryAllowed('Urgent Office Supplies', $allowed));
        $this->assertFalse(ProcurementSopPolicy::directOrderCategoryAllowed('Station maintenance', $allowed));
        $this->assertFalse(ProcurementSopPolicy::directOrderCategoryAllowed('IT Equipment', $allowed));
    }

    public function test_vendor_is_not_suspended_before_an_improvement_cycle(): void
    {
        $this->assertSame('approved', ProcurementSopPolicy::vendorEvaluationOutcome(70));
        $this->assertSame('re_evaluation', ProcurementSopPolicy::vendorEvaluationOutcome(64));
        $this->assertSame('suspended', ProcurementSopPolicy::vendorEvaluationOutcome(64, 60));
    }

    public function test_three_rows_from_one_supplier_do_not_satisfy_the_three_vendor_rule(): void
    {
        $quotes = new Collection([(object)['supplier_id'=>7], (object)['supplier_id'=>7], (object)['supplier_id'=>7]]);
        $this->assertSame(1, ProcurementSopPolicy::distinctSupplierCount($quotes));
    }

    public function test_selected_quote_must_be_compliant_and_current(): void
    {
        $this->assertTrue(ProcurementSopPolicy::quotationCanBeSelected(true, true, now()->addDay()));
        $this->assertFalse(ProcurementSopPolicy::quotationCanBeSelected(false, true, now()->addDay()));
        $this->assertFalse(ProcurementSopPolicy::quotationCanBeSelected(true, true, now()->subDay()));
    }
}
