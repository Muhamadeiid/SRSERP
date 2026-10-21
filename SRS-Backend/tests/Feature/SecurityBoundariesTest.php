<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Services\LeaveDeductionService;
use App\Http\Controllers\PrfController;
use App\Models\CalendarEvent;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SecurityBoundariesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // A focused disposable schema: never run destructive refreshes against a configured ERP database.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'srs.machine_lock_enabled' => false]);
        DB::purge('sqlite');
        Schema::create('users', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('email')->unique();
            $table->string('password'); $table->string('role'); $table->string('department')->default('admin');
            $table->boolean('is_active')->default(true); $table->timestamp('email_verified_at')->nullable();
            $table->rememberToken(); $table->timestamps();
            $table->text('e_signature')->nullable();
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id(); $table->morphs('tokenable'); $table->string('name'); $table->string('token', 64)->unique();
            $table->text('abilities')->nullable(); $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable(); $table->timestamps();
        });
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->string('role'); $table->string('permission_key');
        });
        Schema::create('employees', function (Blueprint $table) {
            $table->id(); $table->string('ibs_code'); $table->string('name'); $table->string('position');
            $table->string('department'); $table->string('work_location'); $table->string('status');
            $table->unsignedBigInteger('user_id')->nullable(); $table->unsignedBigInteger('direct_manager_id')->nullable();
            $table->unsignedBigInteger('user_manager_id')->nullable(); $table->softDeletes(); $table->timestamps();
            $table->date('last_working_date')->nullable(); $table->string('arabic_name')->nullable();
            $table->string('national_id')->nullable(); $table->text('e_signature')->nullable();
        });
        Schema::create('employee_assets', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('employee_id'); $table->string('status');
        });
        Schema::create('projects', function (Blueprint $table) {
            $table->id(); $table->boolean('is_active'); $table->integer('sort');
        });
        \App\Models\Project::clearCache();
        Schema::create('attendances', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('employee_id'); $table->date('date');
            $table->string('check_in')->nullable(); $table->string('check_out')->nullable();
            $table->boolean('is_manual')->default(false); $table->string('status');
            $table->text('notes')->nullable(); $table->unsignedBigInteger('created_by')->nullable(); $table->timestamps();
        });
        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('employee_id')->nullable(); $table->unsignedBigInteger('user_id')->nullable();
            $table->string('employee_name'); $table->string('type'); $table->string('leave_type')->nullable();
            $table->string('status'); $table->decimal('hours')->nullable(); $table->decimal('days')->nullable();
            $table->boolean('paid')->nullable(); $table->boolean('company_paid')->nullable();
            $table->date('start_date')->nullable(); $table->date('end_date')->nullable();
            $table->timestamp('balance_deducted_at')->nullable(); $table->timestamps();
            $table->timestamp('approved_at')->nullable(); $table->timestamp('manager_approved_at')->nullable();
            $table->timestamp('hr_approved_at')->nullable();
        });
        Schema::create('leave_balances', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('employee_id')->unique();
            foreach (['annual', 'casual', 'sick', 'early'] as $type) {
                $table->decimal($type)->nullable(); $table->decimal($type . '_remaining')->nullable();
            }
            $table->timestamps();
        });
        (require database_path('migrations/2026_08_20_090000_create_calendar_events_tables.php'))->up();
        (require database_path('migrations/2026_09_24_090000_add_task_workflow_to_calendar_events.php'))->up();
    }

    private function user(string $role = 'staff'): User
    {
        return User::create(['name' => 'Security test', 'email' => uniqid('security-', true) . '@example.test', 'password' => bcrypt('test-only-password'), 'role' => $role, 'department' => 'admin', 'is_active' => true]);
    }

    public function test_staff_cannot_read_the_hr_leave_calendar(): void
    {
        $user = $this->user();
        $this->withToken($user->createToken('staff')->plainTextToken)
            ->getJson('/api/leave-requests/calendar')->assertForbidden();
    }

    public function test_hr_can_read_the_leave_calendar(): void
    {
        Schema::table('leave_requests', fn (Blueprint $table) => $table->string('department_label')->nullable());
        $user = $this->user('hr');
        $this->withToken($user->createToken('hr')->plainTextToken)
            ->getJson('/api/leave-requests/calendar')->assertOk();
    }

    public function test_staff_cannot_choose_a_manual_prf_number_via_api(): void
    {
        Schema::create('prfs', function (Blueprint $table) { $table->id(); $table->string('prf_number')->unique(); });
        $user = $this->user();
        $this->withToken($user->createToken('staff')->plainTextToken)
            ->postJson('/api/procurement/prfs', [
                'prf_number' => 'PRF-EG1-2026-9999', 'material_category' => ['Tools and Equipment'],
                'items' => [['description' => 'Test item', 'quantity' => 1]],
            ])->assertForbidden();
        $this->assertSame(0, DB::table('prfs')->count());
    }

    public function test_prf_numbering_uses_one_privileged_role_and_format_policy(): void
    {
        $controller = new PrfController();
        $access = new \ReflectionMethod(PrfController::class, 'canNumberRequests');
        foreach (['admin', 'depot_manager', 'procurement', 'purchasing'] as $role) {
            $this->assertTrue($access->invoke($controller, $this->user($role)));
        }
        $this->assertFalse($access->invoke($controller, $this->user()));
        $format = new \ReflectionMethod(PrfController::class, 'normalizeTrackingNumber');
        $this->assertSame('PRF-EG1-2026-0123', $format->invoke($controller, '123', 2026));
        $this->assertSame('PRF-EG1-2026-0123', $format->invoke($controller, 'prf-eg1-2026-123', 2025));
    }

    public function test_authorized_manual_and_staff_automatic_prf_creation_remain_usable(): void
    {
        foreach (['2026_05_07_212738_create_prfs_table.php', '2026_05_07_212748_create_prf_items_table.php', '2026_05_07_212757_create_prf_approvals_table.php'] as $migration) {
            (require database_path('migrations/' . $migration))->up();
        }
        Schema::table('prfs', fn (Blueprint $table) => $table->text('notes_image')->nullable());
        $buyer = $this->user('purchasing');
        $payload = ['prf_number' => '123', 'material_category' => ['Tools and Equipment'], 'items' => [['description' => 'Test item', 'quantity' => 1]]];
        $number = 'PRF-EG1-' . now()->year . '-0123';
        $this->withToken($buyer->createToken('buyer')->plainTextToken)->postJson('/api/procurement/prfs', $payload)
            ->assertCreated()->assertJsonPath('data.prf_number', $number);
        $this->postJson('/api/procurement/prfs', $payload)->assertStatus(422);
        $payload['prf_number'] = 'invalid-number';
        $this->postJson('/api/procurement/prfs', $payload)->assertStatus(422);
        $staff = $this->user();
        auth()->forgetGuards();
        $payload['prf_number'] = '';
        $this->withToken($staff->createToken('staff')->plainTextToken)->postJson('/api/procurement/prfs', $payload)
            ->assertCreated()->assertJsonPath('data.prf_number', 'PRF-EG1-' . now()->year . '-0124');
    }

    public function test_signature_policy_removes_nested_victim_images_but_preserves_earned_approvals(): void
    {
        $actor = $this->user();
        $policy = new \App\Services\FormSignaturePolicy();
        $record = [
            'type' => 'lrf', 'status' => 'pending',
            'employee' => ['user_id' => $actor->id + 100, 'e_signature' => 'victim', 'user' => ['e_signature' => 'victim-account']],
            'alternate_employee' => ['user_id' => $actor->id + 200, 'e_signature' => 'alternate'],
            'signature_parties' => ['employee' => ['e_signature' => 'victim'], 'alternate_employee' => ['e_signature' => 'alternate'], 'hr' => ['e_signature' => 'hr-image']],
            'manager_signature' => 'unearned',
        ];
        $filtered = $policy->filter($record, $actor);
        $this->assertStringNotContainsString('victim', json_encode($filtered));
        $this->assertNull($filtered['signature_parties']['alternate_employee']['e_signature']);
        $this->assertNull($filtered['signature_parties']['hr']['e_signature']);
        $this->assertNull($filtered['manager_signature']);
        $record['status'] = 'approved'; $record['approved_at'] = now()->toISOString();
        $this->assertSame('hr-image', $policy->filter($record, $actor)['signature_parties']['hr']['e_signature']);
        // A reviewed request prints the alternate's stored signature without their approval
        $this->assertSame('alternate', $policy->filter($record, $actor)['signature_parties']['alternate_employee']['e_signature']);
        $this->assertSame('alternate', $policy->filter($record, $actor)['alternate_employee']['e_signature']);
        $managerReviewed = array_merge($record, ['status' => 'manager_approved', 'approved_at' => null, 'manager_approved_at' => now()->toISOString()]);
        $this->assertSame('alternate', $policy->filter($managerReviewed, $actor)['signature_parties']['alternate_employee']['e_signature']);
        $record['employee']['user_id'] = $actor->id;
        $this->assertSame('victim', $policy->filter($record, $actor)['employee']['e_signature']);
        $this->assertSame($record, $policy->filter($record, $this->user('hr')));
    }

    public function test_creator_owned_leave_endpoint_does_not_release_another_employees_signature(): void
    {
        $owner = $this->user();
        $employee = Employee::create(['ibs_code' => 'VICTIM', 'name' => 'Other employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline', 'e_signature' => 'private-image']);
        $leave = LeaveRequest::create(['user_id' => $owner->id, 'employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'status' => 'pending']);
        $this->withToken($owner->createToken('owner')->plainTextToken)->getJson("/api/leave-requests/{$leave->id}")
            ->assertOk()->assertJsonPath('data.employee.e_signature', null)
            ->assertJsonPath('data.signature_parties.employee.e_signature', null)
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_incident_signature_policy_requires_ownership_or_recorded_review(): void
    {
        $actor = $this->user();
        $policy = new \App\Services\FormSignaturePolicy();
        $record = ['report_no' => 'TEST', 'requester_employee' => ['user_id' => 9999, 'e_signature' => 'victim'], 'hr_generalist' => ['e_signature' => 'hr-image']];
        $this->assertNull($policy->filter($record, $actor, true)['requester_employee']['e_signature']);
        $this->assertNull($policy->filter($record, $actor, true)['hr_generalist']['e_signature']);
        $record['hr_signed_at'] = '2026-10-17';
        $this->assertSame('hr-image', $policy->filter($record, $actor, true)['hr_generalist']['e_signature']);
        $record['follow_up_user'] = ['id' => 99, 'e_signature' => 'follow-up-image'];
        $this->assertNull($policy->filter($record, $actor, true)['follow_up_user']['e_signature']);
        $record['follow_up_date'] = '2026-10-17';
        $record['followed_up_by'] = 99;
        $this->assertSame('follow-up-image', $policy->filter($record, $actor, true)['follow_up_user']['e_signature']);
        $record['followed_up_by'] = 100;
        $this->assertNull($policy->filter($record, $actor, true)['follow_up_user']['e_signature']);
    }

    public function test_subordinate_directory_does_not_return_reusable_signatures(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('manager_id')->nullable();
            $table->string('profile_photo_path')->nullable();
        });
        $manager = $this->user('manager');
        $employee = $this->user();
        $employee->update(['manager_id' => $manager->id, 'e_signature' => 'private-subordinate-signature']);
        $this->withToken($manager->createToken('manager')->plainTextToken)->getJson('/api/users/subordinates')
            ->assertOk()->assertJsonPath('0.id', $employee->id)->assertJsonMissingPath('0.e_signature');
    }

    public function test_incident_create_show_and_update_do_not_release_selected_employee_signatures(): void
    {
        (require database_path('migrations/2026_09_03_090000_create_incident_reports_table.php'))->up();
        $owner = $this->user();
        $victims = [];
        foreach (['first', 'second'] as $name) {
            $victims[] = Employee::create(['ibs_code' => $name, 'name' => $name, 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline', 'e_signature' => 'private-' . $name]);
        }
        $this->withToken($owner->createToken('owner')->plainTextToken);
        $created = $this->postJson('/api/incident-reports', ['requester_employee_id' => $victims[0]->id, 'description' => 'Test on behalf']);
        $created->assertCreated()->assertJsonPath('data.requester_employee.e_signature', null);
        $id = $created->json('data.id');
        $this->getJson("/api/incident-reports/{$id}")->assertOk()->assertJsonPath('data.requester_employee.e_signature', null);
        $this->postJson("/api/incident-reports/{$id}", ['requester_employee_id' => $victims[1]->id])
            ->assertOk()->assertJsonPath('data.requester_employee.e_signature', null);
    }

    public function test_login_is_rate_limited_per_account_and_client(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'missing@example.test', 'password' => 'wrong'])->assertUnauthorized();
        }
        $this->postJson('/api/auth/login', ['email' => ' MISSING@example.test ', 'password' => 'wrong'])->assertStatus(429);
        $this->postJson('/api/auth/login', ['email' => 'other@example.test', 'password' => 'wrong'])->assertUnauthorized();
    }

    public function test_secure_transport_gate_rejects_plaintext_and_debug_mode(): void
    {
        config(['srs.require_https' => true, 'app.debug' => false]);
        $this->getJson('/api/auth/me')->assertStatus(503);
        $this->getJson('https://localhost/api/auth/me')->assertUnauthorized();
        config(['app.debug' => true]);
        $this->getJson('/api/auth/me')->assertStatus(503);
    }

    public function test_expired_bearer_sessions_cannot_access_company_data(): void
    {
        config(['sanctum.expiration' => 720]);
        $user = $this->user();
        $token = $user->createToken('expired');
        $token->accessToken->forceFill(['created_at' => now()->subMinutes(721)])->save();
        $this->withToken($token->plainTextToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_forwarded_https_is_only_honored_for_configured_proxies(): void
    {
        config(['srs.require_https' => true, 'app.debug' => false, 'srs.trusted_proxies' => ['10.0.0.2']]);
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.3'])->withHeader('X-Forwarded-Proto', 'https')
            ->getJson('/api/auth/me')->assertStatus(503);
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.2'])->withHeader('X-Forwarded-Proto', 'https')
            ->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_disabled_accounts_cannot_use_an_existing_bearer_token(): void
    {
        $user = $this->user();
        $token = $user->createToken('regression')->plainTextToken;
        $user->update(['is_active' => false]);
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_logout_revokes_the_current_bearer_token_without_revoking_another_session(): void
    {
        $user = $this->user();
        $token = $user->createToken('current')->plainTextToken;
        $user->createToken('other-session');
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        $this->assertSame(1, $user->tokens()->count());
        auth()->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_active_account_access_and_admin_deactivation(): void
    {
        $admin = $this->user('admin');
        $target = $this->user();
        $target->createToken('one');
        $this->withToken($admin->createToken('admin')->plainTextToken)->getJson('/api/auth/me')->assertOk();
        $this->putJson("/api/users/{$target->id}", ['is_active' => false])->assertOk();
        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_prf_role_does_not_override_removed_approval_permission(): void
    {
        $user = $this->user('procurement');
        $method = new \ReflectionMethod(PrfController::class, 'userCanActInStage');
        $stage = ['role' => 'procurement', 'permission' => 'prf.approve_procurement'];
        DB::table('role_permissions')->insert(['role' => 'procurement', 'permission_key' => $stage['permission']]);
        $this->assertTrue($method->invoke(new PrfController(), $user->fresh(), $stage));
        DB::table('role_permissions')->where('role', 'procurement')->delete();
        $this->assertFalse($method->invoke(new PrfController(), $user->fresh(), $stage));
        $this->assertTrue($method->invoke(new PrfController(), $this->user('admin'), $stage));
    }

    public function test_ccp_write_does_not_return_employee_identity_or_signatures(): void
    {
        $ccp = $this->user('ccp');
        $employee = Employee::create(['ibs_code' => 'SEC-CCP', 'name' => 'CCP employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline', 'national_id' => 'confidential-id', 'e_signature' => 'confidential-signature']);
        \App\Models\Attendance::create(['employee_id' => $employee->id, 'date' => '2026-10-17', 'check_in' => '08:00', 'check_out' => '17:00', 'is_manual' => false, 'status' => 'present']);
        $this->withToken($ccp->createToken('ccp')->plainTextToken)
            ->postJson('/api/ccp/attendance/manual', ['employee_id' => $employee->id, 'date' => '2026-10-17', 'check_in' => '08:00', 'check_out' => '17:00', 'status' => 'present', 'notes' => 'Reviewed'])
            ->assertOk()->assertJsonPath('data.employee.name', 'CCP employee')
            ->assertJsonMissingPath('data.employee.national_id')->assertJsonMissingPath('data.employee.e_signature')
            ->assertJsonMissingPath('data.creator.email')->assertJsonMissingPath('data.creator.e_signature');
    }

    public function test_meeting_cannot_be_converted_to_task_with_retained_unauthorized_assignee(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $event = CalendarEvent::create(['type' => 'meeting', 'title' => 'Meeting', 'event_date' => '2026-10-18', 'created_by' => $owner->id]);
        $event->participants()->attach($other->id, ['role' => 'assignee']);
        $this->withToken($owner->createToken('owner')->plainTextToken)
            ->patchJson("/api/calendar/events/{$event->id}", ['type' => 'task'])->assertForbidden();
        $this->assertSame('meeting', $event->fresh()->type);
    }

    public function test_password_reset_revokes_all_tokens_but_invalid_reset_does_not(): void
    {
        $admin = $this->user('admin');
        $target = $this->user();
        $target->createToken('one');
        $target->createToken('two');
        $this->withToken($admin->createToken('admin')->plainTextToken);
        $payload = ['password' => 'new-test-password', 'password_confirmation' => 'new-test-password', 'target_user_id' => $target->id, 'target_email' => 'wrong@example.test'];
        $this->postJson("/api/users/{$target->id}/reset-password", $payload)->assertStatus(409);
        $this->assertSame(2, $target->tokens()->count());
        $payload['target_email'] = $target->email;
        $this->postJson("/api/users/{$target->id}/reset-password", $payload)->assertOk();
        $this->assertSame(0, $target->tokens()->count());
        $this->postJson('/api/auth/login', ['email' => $target->email, 'password' => 'test-only-password'])->assertUnauthorized();
        $this->postJson('/api/auth/login', ['email' => $target->email, 'password' => 'new-test-password'])->assertOk();
    }

    public function test_final_request_pending_amendment_cannot_be_changed_through_reviewer_details(): void
    {
        $admin = $this->user('admin');
        $leave = LeaveRequest::create(['user_id' => $admin->id, 'employee_name' => 'Security test', 'type' => 'otr', 'status' => 'amendment_pending', 'hours' => 2]);
        $this->withToken($admin->createToken('admin')->plainTextToken)
            ->patchJson("/api/leave-requests/{$leave->id}/details", ['hours' => 10])->assertStatus(422);
        $this->assertSame(2.0, $leave->fresh()->hours);
    }

    public function test_ordinary_rejection_cannot_bypass_final_amendment_or_cancellation_review(): void
    {
        $admin = $this->user('admin');
        $this->withToken($admin->createToken('admin')->plainTextToken);
        foreach (['lrf', 'otr'] as $type) {
            foreach (['approved', 'amendment_pending', 'cancellation_pending'] as $status) {
                $leave = LeaveRequest::create(['user_id' => $admin->id, 'employee_name' => 'Security test', 'type' => $type, 'status' => $status]);
                $this->postJson("/api/leave-requests/{$leave->id}/reject", ['reason' => 'Attempted workflow bypass'])->assertStatus(422);
                $this->assertSame($status, $leave->fresh()->status);
            }
        }
    }

    public function test_rejected_request_does_not_resolve_final_signature_images_from_old_approval_timestamp(): void
    {
        $owner = $this->user();
        $manager = $this->user('manager');
        $hr = $this->user('hr');
        $depot = $this->user('depot_manager');
        foreach ([$manager, $hr, $depot] as $user) $user->update(['e_signature' => 'stored-signature']);
        $employee = Employee::create(['ibs_code' => 'SEC-SIG', 'name' => 'Signature employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline', 'user_manager_id' => $manager->id]);
        $leave = LeaveRequest::create(['user_id' => $owner->id, 'employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'status' => 'rejected', 'approved_at' => now(), 'manager_approved_at' => now(), 'hr_approved_at' => now()]);
        $this->withToken($owner->createToken('owner')->plainTextToken)
            ->getJson("/api/leave-requests/{$leave->id}")->assertOk()
            ->assertJsonPath('data.signature_parties.direct_manager.e_signature', null)
            ->assertJsonPath('data.signature_parties.hr.e_signature', null)
            ->assertJsonPath('data.signature_parties.depot_manager.e_signature', null);
    }

    public function test_cancelled_po_cannot_resume_even_with_a_stale_route_model(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id(); $table->string('status'); $table->string('approval_status'); $table->timestamps();
        });
        foreach (['draft', 'pending_procurement', 'pending_depot', 'pending_management', 'approved'] as $stage) {
            $po = new \App\Models\PurchaseOrder();
            $po->forceFill(['status' => 'issued', 'approval_status' => $stage])->save();
            DB::table('purchase_orders')->where('id', $po->id)->update(['status' => 'cancelled']);
            $controller = new \App\Http\Controllers\PurchaseOrderController();
            foreach (['submitForApproval', 'decide', 'update'] as $action) {
                try {
                    if ($action === 'submitForApproval') $controller->$action($po);
                    else $controller->$action(\Illuminate\Http\Request::create('/', 'POST', ['action' => 'approve']), $po);
                    $this->fail('Cancelled PO action unexpectedly succeeded');
                } catch (\Symfony\Component\HttpKernel\Exception\HttpException $exception) {
                    $this->assertSame(422, $exception->getStatusCode());
                }
            }
            $this->assertSame('cancelled', $po->fresh()->status);
        }
    }

    public function test_due_leave_processing_is_idempotent_and_preserves_casual_pool_rules(): void
    {
        $employee = Employee::create(['ibs_code' => 'SEC-TEST', 'name' => 'Security employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline']);
        $balance = LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'casual' => 7]);
        $leave = LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'leave_type' => 'casual', 'status' => 'approved', 'days' => 1, 'paid' => true, 'start_date' => now()->subDays(3), 'end_date' => now()->subDays(2)]);
        $service = app(LeaveDeductionService::class);
        $this->assertSame(1, $service->processDue($employee->id));
        $this->assertSame(0, $service->processDue($employee->id));
        $this->assertNotNull($leave->fresh()->balance_deducted_at);
        $this->assertSame(20.0, $balance->fresh()->getEffectiveRemaining('annual'));
        $this->assertSame(6.0, $balance->fresh()->getEffectiveRemaining('casual'));
    }

    public function test_prf_detail_uses_the_employee_record_signature_when_the_account_has_none(): void
    {
        Schema::create('prfs', function (Blueprint $table) {
            $table->id(); $table->string('prf_number')->unique(); $table->unsignedBigInteger('requested_by');
            $table->date('date')->nullable(); $table->string('status'); $table->text('material_category')->nullable();
            $table->text('notes')->nullable(); $table->longText('notes_image')->nullable(); $table->timestamps();
        });
        Schema::create('prf_items', function (Blueprint $table) { $table->id(); $table->unsignedBigInteger('prf_id'); $table->integer('sn')->default(1); $table->timestamps(); });
        Schema::create('prf_approvals', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('prf_id'); $table->string('role'); $table->string('action');
            $table->unsignedBigInteger('approver_id'); $table->text('comment')->nullable(); $table->timestamp('acted_at')->nullable(); $table->timestamps();
        });
        Schema::create('purchase_orders', function (Blueprint $table) { $table->id(); $table->unsignedBigInteger('prf_id')->nullable(); $table->string('po_number')->nullable(); $table->string('status')->nullable(); $table->timestamps(); });

        $requester = $this->user();
        $requester->update(['e_signature' => 'account-signature']);
        $approver = $this->user('procurement');
        Employee::create(['ibs_code' => 'SIG-1', 'name' => 'Approver', 'status' => 'on_site', 'position' => 'Buyer', 'department' => 'procurement', 'work_location' => 'Depot', 'user_id' => $approver->id, 'e_signature' => 'employee-record-signature']);
        Employee::create(['ibs_code' => 'SIG-2', 'name' => 'Requester', 'status' => 'on_site', 'position' => 'Engineer', 'department' => 'cm', 'work_location' => 'Depot', 'user_id' => $requester->id, 'e_signature' => 'older-employee-signature']);
        $prf = \App\Models\Prf::create(['prf_number' => 'PRF-EG1-2026-0500', 'requested_by' => $requester->id, 'status' => 'pending_ehs']);
        \App\Models\PrfApproval::create(['prf_id' => $prf->id, 'role' => 'procurement', 'action' => 'approved', 'approver_id' => $approver->id, 'acted_at' => now()]);

        $response = $this->withToken($requester->createToken('requester')->plainTextToken)
            ->getJson("/api/procurement/prfs/{$prf->id}")->assertOk();
        // The account's own signature wins; the employee record only fills a gap
        $response->assertJsonPath('data.requester.e_signature', 'account-signature');
        $response->assertJsonPath('data.approvals.0.approver.e_signature', 'employee-record-signature');
    }

    public function test_hr_can_correct_leave_dates_while_reviewing(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->time('early_from')->nullable(); $table->time('early_to')->nullable();
            $table->string('company_paid_purpose')->nullable(); $table->text('purpose')->nullable();
        });
        if (!Schema::hasColumn('leave_balances', 'leave_cycle_started_on')) {
            Schema::table('leave_balances', function (Blueprint $table) { $table->date('leave_cycle_started_on')->nullable(); });
        }
        if (!Schema::hasTable('system_settings')) {
            Schema::create('system_settings', function (Blueprint $table) { $table->id(); $table->string('key')->unique(); $table->text('value')->nullable(); $table->timestamps(); });
        }
        $hr = $this->user('hr');
        $employee = Employee::create(['ibs_code' => 'SEC-DATES', 'name' => 'Dates employee', 'status' => 'on_site', 'position' => 'Engineer', 'department' => 'pm', 'work_location' => 'Kozzika']);
        LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'casual' => 7]);
        $day = fn (int $offset) => now()->startOfWeek()->addWeeks(2)->addDays($offset)->toDateString();
        $early = LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'leave_type' => 'early', 'status' => 'manager_approved', 'days' => 0.5, 'paid' => true, 'start_date' => $day(0), 'end_date' => $day(0), 'early_from' => '13:00', 'early_to' => '17:00']);
        $token = $hr->createToken('hr')->plainTextToken;

        // Early leave: the date moves, the hours stay, and it remains a single day
        $this->withToken($token)->patchJson("/api/leave-requests/{$early->id}/details", [
            'leave_type' => 'early', 'paid' => true, 'start_date' => $day(1), 'end_date' => $day(1), 'early_from' => '13:00', 'early_to' => '17:00',
        ])->assertOk();
        $early->refresh();
        $this->assertSame($day(1), $early->start_date->toDateString());
        $this->assertSame($day(1), $early->end_date->toDateString());
        $this->assertSame('13:00', substr((string) $early->early_from, 0, 5));

        // Full-day leave: moving it onto another request's dates is refused
        LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'leave_type' => 'annual', 'status' => 'approved', 'days' => 1, 'paid' => true, 'start_date' => $day(3), 'end_date' => $day(3)]);
        $annual = LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'leave_type' => 'annual', 'status' => 'manager_approved', 'days' => 1, 'paid' => true, 'start_date' => $day(7), 'end_date' => $day(7)]);
        $this->withToken($token)->patchJson("/api/leave-requests/{$annual->id}/details", [
            'leave_type' => 'annual', 'paid' => true, 'start_date' => $day(2), 'end_date' => $day(3),
        ])->assertStatus(422)->assertJsonValidationErrors('start_date');
        $this->withToken($token)->patchJson("/api/leave-requests/{$annual->id}/details", [
            'leave_type' => 'annual', 'paid' => true, 'start_date' => $day(8), 'end_date' => $day(7),
        ])->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->assertSame($day(7), $annual->fresh()->start_date->toDateString());
    }

    public function test_half_day_left_after_a_reserved_leave_is_still_bookable_and_explained(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) { $table->string('tracking_no')->nullable(); });
        if (!Schema::hasColumn('leave_balances', 'leave_cycle_started_on')) {
            Schema::table('leave_balances', function (Blueprint $table) { $table->date('leave_cycle_started_on')->nullable(); });
        }
        if (!Schema::hasTable('system_settings')) {
            Schema::create('system_settings', function (Blueprint $table) { $table->id(); $table->string('key')->unique(); $table->text('value')->nullable(); $table->timestamps(); });
        }
        $employee = Employee::create(['ibs_code' => 'SEC-HALF', 'name' => 'Half day employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'hm', 'work_location' => 'Tura']);
        LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'casual' => 7, 'annual_remaining' => 2.5, 'casual_remaining' => 2.5, 'leave_cycle_started_on' => now()->startOfYear()->toDateString()]);
        LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'tracking_no' => 'LRF-EG1-2026-1215', 'type' => 'lrf', 'leave_type' => 'annual', 'status' => 'approved', 'days' => 2, 'paid' => true, 'start_date' => now()->addDays(20)->toDateString(), 'end_date' => now()->addDays(21)->toDateString()]);

        $controller = app(\App\Http\Controllers\LeaveRequestController::class);
        $has = new \ReflectionMethod($controller, 'hasAvailableLeaveBalance'); $has->setAccessible(true);
        $this->assertTrue($has->invoke($controller, $employee->id, 'early', 0.5));
        $this->assertFalse($has->invoke($controller, $employee->id, 'early', 0.75));

        // A second open request now holds the last half day: the breakdown names it
        LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'tracking_no' => 'LRF-EG1-2026-1300', 'type' => 'lrf', 'leave_type' => 'early', 'status' => 'pending', 'days' => 0.5, 'paid' => true, 'start_date' => now()->toDateString(), 'end_date' => now()->toDateString()]);
        $this->assertFalse($has->invoke($controller, $employee->id, 'early', 0.5));
        $breakdown = new \ReflectionMethod($controller, 'leaveBalanceBreakdown'); $breakdown->setAccessible(true);
        $result = $breakdown->invoke($controller, $employee->id, 'early', 0.5);
        $this->assertSame(2.5, (float) $result['remaining']);
        $this->assertSame(0.0, (float) $result['available']);
        $this->assertSame(['LRF-EG1-2026-1300', 'LRF-EG1-2026-1215'], collect($result['held_by'])->pluck('tracking_no')->all());
    }

    public function test_due_leaves_are_deducted_in_end_date_order_when_balance_runs_short(): void
    {
        $employee = Employee::create(['ibs_code' => 'SEC-ORDER', 'name' => 'Order employee', 'status' => 'on_site', 'position' => 'Technician', 'department' => 'cm', 'work_location' => 'Mainline']);
        $balance = LeaveBalance::create(['employee_id' => $employee->id, 'annual' => 21, 'casual' => 7, 'annual_remaining' => 3]);
        $leave = fn (string $start, string $end) => LeaveRequest::create(['employee_id' => $employee->id, 'employee_name' => $employee->name, 'type' => 'lrf', 'leave_type' => 'annual', 'status' => 'approved', 'days' => 3, 'paid' => true, 'start_date' => $start, 'end_date' => $end]);
        // Registered first, but ended later: must wait behind the earlier leave
        $later = $leave(now()->subDays(5)->toDateString(), now()->subDays(4)->toDateString());
        $earlier = $leave(now()->subDays(12)->toDateString(), now()->subDays(10)->toDateString());

        $this->assertSame(1, app(LeaveDeductionService::class)->processDue($employee->id));
        $this->assertNotNull($earlier->fresh()->balance_deducted_at);
        $this->assertNull($later->fresh()->balance_deducted_at);
        $this->assertSame(0.0, $balance->fresh()->getEffectiveRemaining('annual'));
    }
}
