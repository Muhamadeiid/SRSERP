<?php

namespace Tests\Feature;

use App\Models\Prf;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PrfNotesImagesTest extends TestCase
{
    use DatabaseTransactions;

    private const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    public function test_a_prf_keeps_several_note_images(): void
    {
        Sanctum::actingAs($this->user());
        $images = [self::PIXEL, self::PIXEL.'AA', self::PIXEL.'BB'];

        $id = $this->postJson('/api/procurement/prfs', $this->payload(['notes_images' => $images]))
            ->assertCreated()->json('data.id');

        $prf = Prf::findOrFail($id);
        $this->assertSame($images, $prf->notes_images);
        $this->assertSame($images[0], $prf->notes_image);
        $this->getJson("/api/procurement/prfs/{$id}")->assertOk()->assertJsonCount(3, 'data.notes_images');
        // Lists stay light: no attachments
        $this->assertArrayNotHasKey('notes_images', collect($this->getJson('/api/procurement/prfs?mine=1')->json('data.data') ?? $this->getJson('/api/procurement/prfs?mine=1')->json('data'))->firstWhere('id', $id) ?? []);

        $this->putJson("/api/procurement/prfs/{$id}", $this->payload(['notes_images' => [$images[2]]]))->assertOk();
        $this->assertSame([$images[2]], $prf->fresh()->notes_images);

        $this->putJson("/api/procurement/prfs/{$id}", $this->payload(['notes_images' => []]))->assertOk();
        $this->assertNull($prf->fresh()->notes_images);
        $this->assertNull($prf->fresh()->notes_image);
    }

    public function test_a_single_image_from_an_older_screen_still_works(): void
    {
        Sanctum::actingAs($this->user());

        $id = $this->postJson('/api/procurement/prfs', $this->payload(['notes_image' => self::PIXEL]))
            ->assertCreated()->json('data.id');

        $this->assertSame([self::PIXEL], Prf::findOrFail($id)->notes_images);
    }

    public function test_too_many_or_non_image_attachments_are_refused(): void
    {
        Sanctum::actingAs($this->user());

        $this->postJson('/api/procurement/prfs', $this->payload(['notes_images' => array_fill(0, 7, self::PIXEL)]))
            ->assertStatus(422);
        $this->postJson('/api/procurement/prfs', $this->payload(['notes_images' => ['data:text/html;base64,PGgxPg==']]))
            ->assertStatus(422);
    }

    private function payload(array $extra): array
    {
        return array_merge([
            'date' => '2096-11-25',
            'delivery_location' => 'Kozzika',
            'material_category' => ['Components and Parts'],
            'items' => [['description' => 'Brake pad', 'quantity' => 4, 'unit' => 'pcs']],
        ], $extra);
    }

    private function user(): User
    {
        $suffix = Str::lower(Str::random(10));

        return User::create([
            'name' => "PRF Images {$suffix}",
            'email' => "prf-images-{$suffix}@example.test",
            'password' => bcrypt('test-only'),
            'role' => 'procurement',
            'department' => 'admin',
            'is_active' => true,
        ]);
    }
}
