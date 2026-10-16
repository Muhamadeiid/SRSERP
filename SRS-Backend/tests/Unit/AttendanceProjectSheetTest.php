<?php

namespace Tests\Unit;

use App\Http\Controllers\AttendanceController;
use ReflectionMethod;
use Tests\TestCase;

class AttendanceProjectSheetTest extends TestCase
{
    public function test_project_budget_codes_are_routed_to_the_expected_sheet(): void
    {
        $controller = app(AttendanceController::class);
        $method = new ReflectionMethod($controller, 'attendanceProjectSheet');
        $method->setAccessible(true);

        $this->assertSame('Ganz', $method->invoke($controller, 'GZ'));
        $this->assertSame('Ganz', $method->invoke($controller, '0052'));
        $this->assertSame('Ganz', $method->invoke($controller, '0052 - Ganz depot'));
        $this->assertSame('Line 1', $method->invoke($controller, 'EG1'));
        $this->assertSame('Line 1', $method->invoke($controller, '0001'));
        $this->assertSame('Line 1', $method->invoke($controller, '0001 / Line 1'));
    }
}
