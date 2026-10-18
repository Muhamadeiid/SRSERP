<?php

namespace Tests\Unit;

use App\Http\Controllers\AttendanceController;
use App\Models\Project;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\TestCase;

class AttendanceProjectSheetTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Disposable schema: never touch the configured ERP database
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'srs.machine_lock_enabled' => false]);
        DB::purge('sqlite');
        Schema::create('projects', function (Blueprint $table) {
            $table->id(); $table->string('code'); $table->string('name');
            $table->string('match_prefix')->nullable(); $table->text('match_locations')->nullable();
            $table->boolean('is_default')->default(false); $table->boolean('is_active')->default(true);
            $table->integer('sort')->default(0); $table->timestamps();
        });
        // Same project rules the projects migrations seed
        DB::table('projects')->insert([
            ['code' => 'EG1', 'name' => 'Cairo Metro Line 1', 'match_prefix' => 'CML1', 'match_locations' => null, 'is_default' => true, 'is_active' => true, 'sort' => 1],
            ['code' => 'GZ', 'name' => 'Ganz', 'match_prefix' => 'Ganz', 'match_locations' => 'Ramses AbuGhates&Farz', 'is_default' => false, 'is_active' => true, 'sort' => 2],
        ]);
        Project::clearCache();
    }

    protected function tearDown(): void
    {
        Project::clearCache();
        parent::tearDown();
    }

    public function test_project_budget_codes_are_routed_to_the_expected_sheet(): void
    {
        $controller = app(AttendanceController::class);
        $method = new ReflectionMethod($controller, 'attendanceProjectSheet');
        $method->setAccessible(true);
        $sheet = fn (?string $budget, ?string $location = null) => $method->invoke($controller, $budget, $location);

        // The budget code actually stored for Ganz staff
        $this->assertSame('Ganz', $sheet('Ganz-RSRSE-0052', 'Kozzika'));
        $this->assertSame('Ganz', $sheet('ganz-rsrse-0052'));
        // Ganz work location even without a budget
        $this->assertSame('Ganz', $sheet(null, 'Ramses AbuGhates&Farz'));
        // Bare project code / budget number
        $this->assertSame('Ganz', $sheet('GZ'));
        $this->assertSame('Ganz', $sheet('0052'));

        $this->assertSame('Line 1', $sheet('CML1-RSRSE-001', 'Tura'));
        $this->assertSame('Line 1', $sheet('Direct Rotem SRS', 'Kozzika'));
        $this->assertSame('Line 1', $sheet('EG1'));
        $this->assertSame('Line 1', $sheet(null));
    }

    public function test_each_project_file_gets_only_its_employees(): void
    {
        $controller = app(AttendanceController::class);
        $method = new ReflectionMethod($controller, 'employeesByProjectSheet');
        $method->setAccessible(true);
        $employee = fn (string $name, ?string $budget, string $location) => (object) ['name' => $name, 'project_budget' => $budget, 'work_location' => $location];

        $groups = $method->invoke($controller, collect([
            $employee('Ganz tech', 'Ganz-RSRSE-0052', 'Kozzika'),
            $employee('Line tech', 'CML1-RSRSE-001', 'Tura'),
            $employee('Direct staff', 'Direct Rotem SRS', 'Kozzika'),
            $employee('Ganz site', null, 'Ramses AbuGhates&Farz'),
        ]));

        $this->assertSame(['Ganz tech', 'Ganz site'], $groups['Ganz']->pluck('name')->all());
        $this->assertSame(['Line tech', 'Direct staff'], $groups['Line 1']->pluck('name')->all());
    }

    public function test_sheet_titles_are_valid_and_unique_for_shared_names(): void
    {
        $controller = app(AttendanceController::class);
        $method = new ReflectionMethod($controller, 'uniqueSheetTitle');
        $method->setAccessible(true);
        $used = [];
        $title = function (string $name) use ($method, $controller, &$used) {
            $args = [$name, &$used];
            return $method->invokeArgs($controller, $args);
        };

        $this->assertSame('Ahmed Ali', $title('Ahmed Ali'));
        $this->assertSame('Ahmed Ali (2)', $title('Ahmed Ali'));
        $this->assertSame('a_b_c', $title('a/b?c'));
        $long = $title('Abdel Naby Abdel Aziz Saleh Elsayed Mohamed');
        $this->assertLessThanOrEqual(31, mb_strlen($long));
        $this->assertLessThanOrEqual(31, mb_strlen($title('Abdel Naby Abdel Aziz Saleh Elsayed Mohamed')));
    }
}
