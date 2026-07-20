<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveRequestSignaturePartiesTest extends TestCase
{
    use DatabaseTransactions;

    public function test_show_uses_current_role_signatures_instead_of_admin_approver(): void
    {
        $suffix = Str::lower(Str::random(8));
        $signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+XwNWPwAAAABJRU5ErkJggg==';

        $admin = User::create([
            'name' => 'Admin User',
            'email' => "signature-admin-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'admin',
            'department' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($admin);

        $hr = User::where('role', 'hr')->where('is_active', true)->first()
            ?: User::create([
                'name' => 'Current HR Officer',
                'email' => "signature-hr-{$suffix}@example.test",
                'password' => bcrypt('test-only'),
                'role' => 'hr',
                'department' => 'hr',
                'is_active' => true,
            ]);
        $hr->update(['e_signature' => $signature]);
        $hrEmployee = Employee::active()->where('user_id', $hr->id)->first();
        if ($hrEmployee) {
            $hrEmployee->update(['e_signature' => $signature]);
        }

        $depot = User::where('role', 'depot_manager')->where('is_active', true)->first()
            ?: User::create([
                'name' => 'Current Depot Manager',
                'email' => "signature-depot-{$suffix}@example.test",
                'password' => bcrypt('test-only'),
                'role' => 'depot_manager',
                'department' => 'admin',
                'is_active' => true,
            ]);
        $depot->update(['e_signature' => $signature]);
        $depotEmployee = Employee::active()->where('user_id', $depot->id)->first();
        if ($depotEmployee) {
            $depotEmployee->update(['e_signature' => $signature]);
        }

        $managerUser = User::create([
            'name' => 'Current Direct Manager',
            'email' => "signature-manager-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'manager',
            'department' => 'cm',
            'is_active' => true,
            'e_signature' => $signature,
        ]);
        $manager = Employee::create([
            'ibs_code' => "SIG-MGR-{$suffix}",
            'name' => 'Current Direct Manager',
            'position' => 'Manager',
            'department' => 'cm',
            'work_location' => 'Mainline',
            'status' => 'on_site',
            'user_id' => $managerUser->id,
            'e_signature' => $signature,
        ]);
        $employee = Employee::create([
            'ibs_code' => "SIG-EMP-{$suffix}",
            'name' => 'Signature Test Employee',
            'position' => 'Technician',
            'department' => 'cm',
            'work_location' => 'Mainline',
            'status' => 'on_site',
            'direct_manager_id' => $manager->id,
        ]);

        $leave = LeaveRequest::create([
            'tracking_no' => "LRF-SIG-{$suffix}",
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'direct_manager_name' => $manager->name,
            'type' => 'lrf',
            'leave_type' => 'annual',
            'status' => 'approved',
            'manager_approved_by' => $admin->id,
            'hr_approved_by' => $admin->id,
            'approved_by' => $admin->id,
        ]);

        $this->getJson("/api/leave-requests/{$leave->id}")
            ->assertOk()
            ->assertJsonPath('data.signature_parties.direct_manager.name', $manager->name)
            ->assertJsonPath('data.signature_parties.direct_manager.e_signature', $signature)
            ->assertJsonPath('data.signature_parties.hr.name', $hrEmployee?->name ?: $hr->name)
            ->assertJsonPath('data.signature_parties.hr.e_signature', $signature)
            ->assertJsonPath('data.signature_parties.depot_manager.name', $depotEmployee?->name ?: $depot->name)
            ->assertJsonPath('data.signature_parties.depot_manager.e_signature', $signature);
    }
}
