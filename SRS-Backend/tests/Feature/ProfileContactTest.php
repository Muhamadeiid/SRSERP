<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileContactTest extends TestCase
{
    use DatabaseTransactions;

    public function test_user_can_update_only_their_own_business_contact_details(): void
    {
        $user = User::factory()->create([
            'role' => 'staff',
            'department' => 'operations',
            'is_active' => true,
        ]);
        $otherUser = User::factory()->create([
            'role' => 'staff',
            'department' => 'operations',
            'is_active' => true,
            'company_email' => 'other@company.example',
            'mobile_number' => '01000000000',
        ]);

        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile/contact', [
            'company_email' => ' User.Name@Company.Example ',
            'mobile_number' => ' 01012345678 ',
            'id' => $otherUser->id,
            'role' => 'admin',
        ])->assertOk()
            ->assertJsonPath('user.company_email', 'user.name@company.example')
            ->assertJsonPath('user.mobile_number', '01012345678')
            ->assertJsonPath('user.role', 'staff');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'company_email' => 'user.name@company.example',
            'mobile_number' => '01012345678',
            'role' => 'staff',
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $otherUser->id,
            'company_email' => 'other@company.example',
            'mobile_number' => '01000000000',
        ]);
    }

    public function test_profile_contact_rejects_invalid_company_email(): void
    {
        $user = User::factory()->create([
            'role' => 'staff',
            'department' => 'operations',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile/contact', [
            'company_email' => 'not-an-email',
        ])->assertUnprocessable()->assertJsonValidationErrors('company_email');
    }
}
