<?php

namespace Tests\Unit;

use App\Http\Controllers\EmployeeController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class EmployeeImportTest extends TestCase
{
    public function test_blank_and_non_numeric_ibs_codes_are_imported_as_null(): void
    {
        $this->assertNull($this->mapRow(['english name' => 'No IBS', 'ibs code' => ''])['ibs_code']);
        $this->assertNull($this->mapRow(['english name' => 'Text IBS', 'ibs code' => 'Rotem SRS'])['ibs_code']);
    }

    public function test_numeric_ibs_code_is_preserved(): void
    {
        $this->assertSame(
            '394338',
            $this->mapRow(['english name' => 'Mohamed Saleh', 'ibs code' => '394338'])['ibs_code']
        );
    }

    private function mapRow(array $row): array
    {
        $method = new ReflectionMethod(EmployeeController::class, 'mapRow');

        return $method->invoke(new EmployeeController(), $row);
    }
}
