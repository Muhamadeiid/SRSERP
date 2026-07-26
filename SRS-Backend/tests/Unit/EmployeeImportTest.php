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

    public function test_resignation_fields_are_mapped_for_ex_employee_imports(): void
    {
        $mapped = $this->mapRow([
            'english name' => 'Former Employee',
            'status' => 'terminated',
            'resignation date' => '2026-06-30',
            'last working date' => '2026-07-12',
        ]);

        $this->assertSame('terminated', $mapped['status']);
        $this->assertSame('2026-06-30', $mapped['resignation_date']);
        $this->assertSame('2026-07-12', $mapped['last_working_date']);
    }

    public function test_employee_names_are_normalized_for_import_matching(): void
    {
        $method = new ReflectionMethod(EmployeeController::class, 'normalizeEmployeeName');

        $this->assertSame(
            'alaa mohamed shehata',
            $method->invoke(new EmployeeController(), '  ALAA   Mohamed  Shehata ')
        );
    }

    private function mapRow(array $row): array
    {
        $method = new ReflectionMethod(EmployeeController::class, 'mapRow');

        return $method->invoke(new EmployeeController(), $row);
    }
}
