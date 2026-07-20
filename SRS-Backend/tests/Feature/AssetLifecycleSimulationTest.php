<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\IssuingSource;
use App\Models\ITAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AssetLifecycleSimulationTest extends TestCase
{
    use DatabaseTransactions;

    private User $hr;
    private Employee $employee;
    private IssuingSource $source;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = Str::lower(Str::random(8));
        $this->hr = User::create([
            'name' => 'Asset Simulation HR',
            'email' => "asset-simulation-{$suffix}@example.test",
            'password' => bcrypt('simulation-only'),
            'role' => 'admin',
            'department' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($this->hr);

        $this->employee = Employee::create([
            'ibs_code' => 'SIM-' . strtoupper($suffix),
            'punch_code' => 'SIM-' . random_int(10000, 99999),
            'name' => 'Asset Lifecycle Simulation Employee',
            'position' => 'Simulation Technician',
            'department' => 'cm_intervention',
            'work_location' => 'Mainline',
            'status' => 'on_site',
        ]);

        $this->source = IssuingSource::where('key', 'inventory')->first()
            ?? IssuingSource::create([
                'key' => 'simulation-' . $suffix,
                'label_en' => 'Simulation Inventory',
                'is_active' => true,
                'sort' => 999,
            ]);
    }

    public function test_resigned_employee_stays_active_until_all_custody_is_returned(): void
    {
        $assign = $this->postJson('/api/assets', [
            'employee_id' => $this->employee->id,
            'issuing_source_id' => $this->source->id,
            'asset_name' => 'Simulation Safety Helmet',
            'asset_code' => 'SIM-PPE-001',
            'asset_category' => 'PPE',
            'received_date' => now()->subMonth()->toDateString(),
            'condition' => 'Good',
        ])->assertCreated()->assertJsonPath('data.status', 'Active');

        $assetId = $assign->json('data.id');
        $this->employee->update([
            'resignation_date' => now()->subDays(10)->toDateString(),
            'last_working_date' => now()->subDay()->toDateString(),
        ]);

        $this->assertTrue(Employee::active()->whereKey($this->employee->id)->exists());
        $this->assertFalse(Employee::exEmployees()->whereKey($this->employee->id)->exists());

        $this->getJson("/api/assets/clearance/{$this->employee->id}")
            ->assertOk()
            ->assertJsonPath('data.active_count', 1)
            ->assertJsonPath('data.returned_count', 0);

        $this->postJson("/api/assets/{$assetId}/return", [
            'return_date' => now()->toDateString(),
            'condition' => 'Good',
        ])->assertOk()->assertJsonPath('data.status', 'Returned');

        $this->assertFalse(Employee::active()->whereKey($this->employee->id)->exists());
        $this->assertTrue(Employee::exEmployees()->whereKey($this->employee->id)->exists());
        $this->assertDatabaseHas('employee_assets', [
            'id' => $assetId,
            'status' => 'Returned',
            'received_by_user_id' => $this->hr->id,
        ]);
    }

    public function test_damaged_it_asset_is_returned_from_employee_but_not_made_available_again(): void
    {
        $baselineDamaged = ITAsset::where('status', 'Damaged')->count();
        $itSource = IssuingSource::where('key', 'it')->first() ?? $this->source;
        $itAsset = ITAsset::create([
            'item' => 'Laptop',
            'asset_no' => 'SIM-IT-001',
            'name' => 'Simulation Laptop',
            'qty' => 1,
            'serial_number' => 'SIM-SERIAL-001',
            'condition' => 'Good',
            'status' => 'Available',
            'created_by' => $this->hr->id,
        ]);

        $assign = $this->postJson("/api/it-assets/{$itAsset->id}/assign", [
            'employee_id' => $this->employee->id,
            'issuing_source_id' => $itSource->id,
            'received_date' => now()->subWeek()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.status', 'Active');

        $employeeAssetId = $assign->json('data.id');
        $this->assertDatabaseHas('it_assets', [
            'id' => $itAsset->id,
            'user_name' => $this->employee->name,
            'status' => 'Assigned',
            'condition' => 'Good',
        ]);

        $this->getJson('/api/it-assets?status=Assigned&search=' . urlencode($this->employee->name))
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.asset_no', 'SIM-IT-001');

        $this->getJson("/api/assets/clearance/{$this->employee->id}")
            ->assertOk()
            ->assertJsonPath('data.employee.name', $this->employee->name)
            ->assertJsonPath('data.employee.ibs_code', $this->employee->ibs_code)
            ->assertJsonPath('data.employee.work_location', 'Mainline')
            ->assertJsonPath('data.active_count', 1)
            ->assertJsonPath('data.by_department.0.assets.0.asset_name', 'Laptop — Simulation Laptop')
            ->assertJsonPath('data.by_department.0.assets.0.asset_code', 'SIM-IT-001')
            ->assertJsonPath('data.by_department.0.assets.0.it_asset.serial_number', 'SIM-SERIAL-001')
            ->assertJsonPath('data.by_department.0.assets.0.condition', 'Good');

        $this->postJson("/api/assets/{$employeeAssetId}/return", [
            'return_date' => now()->toDateString(),
            'condition' => 'Damaged',
        ])->assertOk();

        $this->assertDatabaseHas('employee_assets', [
            'id' => $employeeAssetId,
            'status' => 'Returned',
            'condition' => 'Damaged',
        ]);
        $this->assertDatabaseHas('it_assets', [
            'id' => $itAsset->id,
            'user_name' => null,
            'status' => 'Damaged',
            'condition' => 'Damaged',
        ]);

        $this->getJson('/api/it-assets?status=Damaged&search=SIM-IT-001')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.condition', 'Damaged');

        $this->getJson('/api/assets?condition=Damaged&search=Asset%20Lifecycle%20Simulation')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.status', 'Returned');

        $this->getJson('/api/it-assets/stats')
            ->assertOk()
            ->assertJsonPath('damaged', $baselineDamaged + 1);

        $this->postJson("/api/it-assets/{$itAsset->id}/assign", [
            'employee_id' => $this->employee->id,
        ])->assertUnprocessable()->assertJsonPath('message', 'This IT asset is not available for assignment');

        $this->getJson("/api/assets/clearance/{$this->employee->id}")
            ->assertOk()
            ->assertJsonPath('data.active_count', 0)
            ->assertJsonPath('data.returned_count', 1);
    }

    public function test_good_it_asset_becomes_available_after_return(): void
    {
        $itAsset = ITAsset::create([
            'item' => 'Mouse',
            'asset_no' => 'SIM-IT-002',
            'name' => 'Simulation Mouse',
            'qty' => 1,
            'condition' => 'Good',
            'status' => 'Available',
            'created_by' => $this->hr->id,
        ]);

        $assign = $this->postJson("/api/it-assets/{$itAsset->id}/assign", [
            'employee_id' => $this->employee->id,
        ])->assertCreated();

        $this->postJson('/api/assets/' . $assign->json('data.id') . '/return', [
            'return_date' => now()->toDateString(),
            'condition' => 'Good',
        ])->assertOk();

        $this->assertDatabaseHas('it_assets', [
            'id' => $itAsset->id,
            'user_name' => null,
            'status' => 'Available',
            'condition' => 'Good',
        ]);
    }
}
