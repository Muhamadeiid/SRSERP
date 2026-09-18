<?php

namespace App\Services;

use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class ProcurementSopPolicy
{
    public static function directOrderCategoryAllowed(?string $category, array $allowedCategories): bool
    {
        $category = mb_strtolower(trim((string) $category));
        if ($category === '') return false;

        foreach ($allowedCategories as $allowed) {
            $allowed = mb_strtolower(trim((string) $allowed));
            $isShortCode = mb_strlen($allowed) <= 4 && !str_contains($allowed, ' ');
            if ($allowed !== '' && ($category === $allowed || (!$isShortCode && str_contains($category, $allowed)))) {
                return true;
            }
        }

        return false;
    }

    public static function vendorEvaluationOutcome(float $percentage, ?float $previousPercentage = null): string
    {
        if ($percentage >= 70) return 'approved';
        if ($percentage < 65 && $previousPercentage !== null && $previousPercentage < 65) return 'suspended';
        return 're_evaluation';
    }

    public static function distinctSupplierCount(Collection $quotations): int
    {
        return $quotations->pluck('supplier_id')->filter()->unique()->count();
    }

    public static function quotationCanBeSelected(bool $technicalCompliant, bool $ehsCompliant, ?CarbonInterface $expiryDate): bool
    {
        return $technicalCompliant && $ehsCompliant && (!$expiryDate || !$expiryDate->isBefore(today()));
    }
}
