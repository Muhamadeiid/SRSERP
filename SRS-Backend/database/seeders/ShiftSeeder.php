<?php

namespace Database\Seeders;

use App\Models\Shift;
use Illuminate\Database\Seeder;

class ShiftSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $shifts = [
            [
                'name' => 'Morning Shift',
                'code' => 'morning',
                'start_time' => '08:00:00',
                'end_time' => '17:00:00',
                'expected_hours' => 8.00,
            ],
            [
                'name' => 'Night Shift',
                'code' => 'night',
                'start_time' => '20:00:00',
                'end_time' => '04:00:00',
                'expected_hours' => 8.00,
            ],
            [
                'name' => 'Intervention',
                'code' => 'intervention',
                'start_time' => '00:00:00',
                'end_time' => '00:00:00',
                'expected_hours' => 9.00,
            ],
        ];

        foreach ($shifts as $shift) {
            Shift::updateOrCreate(
                ['code' => $shift['code']],
                $shift
            );
        }

        $this->command->info('Shifts seeded successfully!');
    }
}
