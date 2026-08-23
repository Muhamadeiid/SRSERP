<?php

namespace Tests\Unit;

use App\Models\Employee;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class EmployeeInterventionTest extends TestCase
{
    #[DataProvider('interventionDepartmentNames')]
    public function test_intervention_department_names_are_normalized(string $department): void
    {
        $employee = new Employee(['department' => $department]);

        $this->assertTrue($employee->isIntervention());
    }

    public static function interventionDepartmentNames(): array
    {
        return [
            ['Intervention'],
            ['cm_intervention'],
            ['CM Intervention'],
            ['CM (Intervention)'],
        ];
    }
}
