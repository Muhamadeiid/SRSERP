<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\EmployeeAsset;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class EmployeeAssetSeeder extends Seeder
{
    public function run(): void
    {
        // Asset pools per issuing department
        $pools = [
            'EHS' => [
                ['Safety Vest',        'EHS-SV',  'PPE',       'Good'],
                ['Safety Shoes',       'EHS-SS',  'PPE',       'Good'],
                ['Safety Cap',         'EHS-SC',  'PPE',       'Good'],
                ['Safety Gloves',      'EHS-SG',  'PPE',       'Good'],
                ['Safety Glasses',     'EHS-SGl', 'PPE',       'Poor'],
                ['High-Vis Jacket',    'EHS-HV',  'PPE',       'Good'],
                ['Ear Protection',     'EHS-EP',  'PPE',       'Good'],
                ['Safety Harness',     'EHS-SH',  'PPE',       'Good'],
            ],
            'IT' => [
                ['Laptop',             'IT-LP',  'Device',    'Good'],
                ['Mouse',              'IT-MS',  'Device',    'Good'],
                ['Keyboard',           'IT-KB',  'Device',    'Good'],
                ['USB Hub',            'IT-UH',  'Device',    'Good'],
                ['Headset',            'IT-HS',  'Device',    'Good'],
                ['Docking Station',    'IT-DS',  'Device',    'Good'],
                ['Laptop Bag',         'IT-LB',  'Accessory', 'Good'],
                ['Charger',            'IT-CH',  'Accessory', 'Good'],
            ],
            'HR' => [
                ['ID Employee Card',   'HR-ID',  'Document',  'Good'],
                ['Access Card',        'HR-AC',  'Document',  'Good'],
                ['Locker Key',         'HR-LK',  'Key',       'Good'],
            ],
            'Inventory' => [
                ['Radio (Walkie Talkie)', 'INV-RT', 'Device', 'Good'],
                ['Barcode Scanner',    'INV-BS',  'Device',    'Good'],
                ['Toolbox',            'INV-TB',  'Tool',      'Good'],
                ['Safety Lock',        'INV-SL',  'Tool',      'Good'],
            ],
            'Corrective Maintenance' => [
                ['Multimeter',         'CM-MM',  'Tool',      'Good'],
                ['Tool Set',           'CM-TS',  'Tool',      'Good'],
                ['Safety Harness',     'CM-SH',  'PPE',       'Good'],
                ['Test Probe Set',     'CM-TP',  'Tool',      'Good'],
                ['Oscilloscope',       'CM-OS',  'Equipment', 'Good'],
            ],
            'Preventive Maintenance' => [
                ['PM Laptop',          'PM-LP',  'Device',    'Good'],
                ['Tablet',             'PM-TB',  'Device',    'Good'],
                ['Inspection Tool',    'PM-IT',  'Tool',      'Good'],
                ['Measuring Tape',     'PM-MT',  'Tool',      'Good'],
                ['Torque Wrench',      'PM-TW',  'Tool',      'Good'],
            ],
        ];

        // Dept-to-issuing-department mapping based on employee department
        $deptMap = [
            'heavy_maintenance' => ['EHS', 'IT', 'HR', 'Corrective Maintenance', 'Preventive Maintenance'],
            'workshop'          => ['EHS', 'IT', 'HR', 'Inventory'],
            'intervention'      => ['EHS', 'IT', 'HR'],
        ];

        $employees = Employee::all();
        $assets    = [];
        $now       = now();

        // Seed 1: Every employee gets EHS + HR basics
        foreach ($employees as $emp) {
            // EHS PPE (first 3)
            foreach (array_slice($pools['EHS'], 0, 3) as $idx => $item) {
                $assets[] = [
                    'employee_id'        => $emp->id,
                    'issuing_department' => 'EHS',
                    'asset_name'         => $item[0],
                    'asset_code'         => $item[1] . '-' . str_pad($emp->id, 4, '0', STR_PAD_LEFT),
                    'asset_category'     => $item[2],
                    'received_date'      => Carbon::now()->subMonths(rand(3, 24))->toDateString(),
                    'condition'          => $item[3],
                    'status'             => 'Active',
                    'created_by'         => 3,
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ];
            }

            // HR ID card
            $assets[] = [
                'employee_id'        => $emp->id,
                'issuing_department' => 'HR',
                'asset_name'         => 'ID Employee Card',
                'asset_code'         => 'HR-ID-' . str_pad($emp->id, 4, '0', STR_PAD_LEFT),
                'asset_category'     => 'Document',
                'received_date'      => Carbon::now()->subMonths(rand(6, 30))->toDateString(),
                'condition'          => 'Good',
                'status'             => 'Active',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
        }

        // Seed 2: IT assets for ~40 employees
        $itEmpIds = $employees->pluck('id')->shuffle()->take(40)->values();
        foreach ($itEmpIds as $idx => $empId) {
            // Laptop
            $assets[] = [
                'employee_id'        => $empId,
                'issuing_department' => 'IT',
                'asset_name'         => 'Laptop',
                'asset_code'         => 'IT-LP-' . str_pad($empId, 4, '0', STR_PAD_LEFT),
                'asset_category'     => 'Device',
                'received_date'      => Carbon::now()->subMonths(rand(2, 18))->toDateString(),
                'condition'          => 'Good',
                'status'             => 'Active',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
            // Mouse
            $assets[] = [
                'employee_id'        => $empId,
                'issuing_department' => 'IT',
                'asset_name'         => 'Mouse',
                'asset_code'         => 'IT-MS-' . str_pad($empId, 4, '0', STR_PAD_LEFT),
                'asset_category'     => 'Device',
                'received_date'      => Carbon::now()->subMonths(rand(2, 18))->toDateString(),
                'condition'          => 'Good',
                'status'             => 'Active',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
        }

        // Seed 3: CM tools for heavy_maintenance employees
        $hmEmps = $employees->where('department', 'heavy_maintenance');
        foreach ($hmEmps as $emp) {
            $item = $pools['Corrective Maintenance'][array_rand($pools['Corrective Maintenance'])];
            $assets[] = [
                'employee_id'        => $emp->id,
                'issuing_department' => 'Corrective Maintenance',
                'asset_name'         => $item[0],
                'asset_code'         => $item[1] . '-' . str_pad($emp->id, 4, '0', STR_PAD_LEFT),
                'asset_category'     => $item[2],
                'received_date'      => Carbon::now()->subMonths(rand(1, 12))->toDateString(),
                'condition'          => $item[3],
                'status'             => 'Active',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
            // Some also have PM tools
            if ($emp->id % 3 === 0) {
                $pmItem = $pools['Preventive Maintenance'][array_rand($pools['Preventive Maintenance'])];
                $assets[] = [
                    'employee_id'        => $emp->id,
                    'issuing_department' => 'Preventive Maintenance',
                    'asset_name'         => $pmItem[0],
                    'asset_code'         => $pmItem[1] . '-' . str_pad($emp->id, 4, '0', STR_PAD_LEFT),
                    'asset_category'     => $pmItem[2],
                    'received_date'      => Carbon::now()->subMonths(rand(1, 12))->toDateString(),
                    'condition'          => $pmItem[3],
                    'status'             => 'Active',
                    'created_by'         => 3,
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ];
            }
        }

        // Seed 4: Inventory items for workshop + some intervention
        $invEmps = $employees->whereIn('department', ['workshop', 'intervention'])->take(20);
        foreach ($invEmps as $emp) {
            $item = $pools['Inventory'][array_rand($pools['Inventory'])];
            $assets[] = [
                'employee_id'        => $emp->id,
                'issuing_department' => 'Inventory',
                'asset_name'         => $item[0],
                'asset_code'         => $item[1] . '-' . str_pad($emp->id, 4, '0', STR_PAD_LEFT),
                'asset_category'     => $item[2],
                'received_date'      => Carbon::now()->subMonths(rand(1, 10))->toDateString(),
                'condition'          => $item[3],
                'status'             => 'Active',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
        }

        // Seed 5: A few returned assets for variety
        $returnedEmpIds = $employees->pluck('id')->shuffle()->take(10)->values();
        $conditions = ['Good', 'Poor', 'Damaged'];
        foreach ($returnedEmpIds as $empId) {
            $assets[] = [
                'employee_id'        => $empId,
                'issuing_department' => 'EHS',
                'asset_name'         => 'Safety Gloves',
                'asset_code'         => 'EHS-SG-RET-' . str_pad($empId, 4, '0', STR_PAD_LEFT),
                'asset_category'     => 'PPE',
                'received_date'      => Carbon::now()->subMonths(rand(12, 24))->toDateString(),
                'return_date'        => Carbon::now()->subMonths(rand(1, 6))->toDateString(),
                'condition'          => $conditions[array_rand($conditions)],
                'status'             => 'Returned',
                'notes'              => 'Worn out, replaced.',
                'created_by'         => 3,
                'created_at'         => $now,
                'updated_at'         => $now,
            ];
        }

        // Normalize all rows to the same keys so bulk insert doesn't fail on mixed column counts
        $base = [
            'employee_id' => null, 'issuing_department' => null, 'asset_name' => null,
            'asset_code' => null, 'asset_category' => null, 'received_date' => null,
            'return_date' => null, 'condition' => null, 'status' => null,
            'notes' => null, 'created_by' => null, 'created_at' => null, 'updated_at' => null,
        ];
        $assets = array_map(fn($r) => array_merge($base, $r), $assets);

        foreach (array_chunk($assets, 200) as $chunk) {
            EmployeeAsset::insert($chunk);
        }

        $this->command->info('EmployeeAsset seeder: inserted ' . count($assets) . ' records.');
    }
}
