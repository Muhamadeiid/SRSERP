<?php

namespace Database\Seeders;

use App\Models\Equipment;
use Illuminate\Database\Seeder;

class FleetSeeder extends Seeder
{
    // Car types per unit position in the train
    // Train = Unit1(MC1-T-M1) + Unit2(M2-T-M1) + Unit3(M1-T-MC2)
    private const UNIT_CARS = [
        1 => ['MC1', 'T', 'M1'],
        2 => ['M2',  'T', 'M1'],
        3 => ['M1',  'T', 'MC2'],
    ];

    public function run(): void
    {
        $created = 0;

        for ($train = 1; $train <= 20; $train++) {
            $trainCode = 'T' . str_pad($train, 2, '0', STR_PAD_LEFT);

            $trainEq = Equipment::updateOrCreate(
                ['code' => $trainCode],
                [
                    'name'         => "Train {$train}",
                    'type'         => 'train',
                    'fleet'        => 'CML1',
                    'train_number' => $train,
                    'status'       => 'available',
                ]
            );

            for ($u = 1; $u <= 3; $u++) {
                $unitCode = (string) (1000 + ($u - 1) * 20 + $train);

                $unitEq = Equipment::updateOrCreate(
                    ['code' => $unitCode],
                    [
                        'name'         => "Unit {$unitCode}",
                        'type'         => 'unit',
                        'fleet'        => 'CML1',
                        'train_number' => $train,
                        'unit_index'   => $u,
                        'parent_id'    => $trainEq->id,
                        'status'       => 'available',
                    ]
                );

                foreach (self::UNIT_CARS[$u] as $carType) {
                    $carCode = "{$carType}-{$unitCode}";

                    Equipment::updateOrCreate(
                        ['code' => $carCode],
                        [
                            'name'         => "{$carType} {$unitCode}",
                            'type'         => 'car',
                            'car_type'     => $carType,
                            'fleet'        => 'CML1',
                            'train_number' => $train,
                            'unit_index'   => $u,
                            'parent_id'    => $unitEq->id,
                            'status'       => 'available',
                        ]
                    );
                    $created++;
                }
            }
        }

        $trains = Equipment::where('type', 'train')->count();
        $units  = Equipment::where('type', 'unit')->count();
        $cars   = Equipment::where('type', 'car')->count();

        $this->command->info("Fleet seeded: {$trains} trains, {$units} units, {$cars} cars");
    }
}
