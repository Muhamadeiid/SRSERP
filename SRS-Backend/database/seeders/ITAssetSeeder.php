<?php

namespace Database\Seeders;

use App\Models\ITAsset;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class ITAssetSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $assets = [
            // ── Laptops ──
            ['Laptop', 'Lenovo ThinkPad E15',     1, 'SN-LP-001', 'Engineering',      'Line 1 Control Room', 'Monthly',   'Active', 'Mohamed Ahmed Hassan'],
            ['Laptop', 'Lenovo ThinkPad E15',     1, 'SN-LP-002', 'Engineering',      'Line 1 Office',       'Monthly',   'Active', 'Ahmed Salah Ibrahim'],
            ['Laptop', 'Dell Latitude 5420',      1, 'SN-LP-003', 'HR & Admin',        'HR Office',           'Monthly',   'Active', 'Sara Khaled Youssef'],
            ['Laptop', 'HP ProBook 450',           1, 'SN-LP-004', 'Maintenance',      'Workshop',            'Monthly',   'Active', 'Khaled Mahmoud Ali'],
            ['Laptop', 'Dell Latitude 5420',      1, 'SN-LP-005', 'Project Control',  'Project Room',        'Monthly',   'Active', 'Omar Tarek Farouk'],
            ['Laptop', 'Lenovo ThinkPad E15',     1, 'SN-LP-006', 'IT Department',    'IT Room',             'Monthly',   'Active', 'Ahmed Hussain'],
            ['Laptop', 'HP EliteBook 840',         1, 'SN-LP-007', 'Management',       'Manager Office',      'Quarterly', 'Active', 'Mohamed Awaad Hussein'],
            ['Laptop', 'Lenovo ThinkPad L15',     1, 'SN-LP-008', 'Engineering',      'Line 1 Office',       'Monthly',   'Active', 'Mostafa Adel Nasser'],
            ['Laptop', 'Dell Inspiron 15',         1, 'SN-LP-009', 'Maintenance',      'CM Office',           'Monthly',   'Active', 'Hassan Ramzy Eid'],
            ['Laptop', 'HP ProBook 450',           1, 'SN-LP-010', 'Maintenance',      'PM Office',           'Monthly',   'Active', 'Amr Saeed Abdallah'],
            // ── Desktops ──
            ['Desktop', 'HP Compaq 8300 SFF',     1, 'SN-DT-001', 'HR & Admin',       'HR Office',           'Quarterly', 'Active', 'Sara Khaled Youssef'],
            ['Desktop', 'Dell OptiPlex 7010',     1, 'SN-DT-002', 'Engineering',      'Line 1 Control Room', 'Quarterly', 'Active', 'Shared'],
            ['Desktop', 'Dell OptiPlex 7010',     1, 'SN-DT-003', 'IT Department',    'IT Room',             'Monthly',   'Active', 'Ahmed Hussain'],
            ['Desktop', 'Lenovo ThinkCentre',     1, 'SN-DT-004', 'Project Control',  'Project Room',        'Quarterly', 'Active', 'Shared'],
            // ── Monitors ──
            ['Monitor', 'Dell P2419H 24"',        2, 'SN-MN-001', 'Engineering',      'Line 1 Control Room', 'Semi-Annual', 'Active', 'Shared'],
            ['Monitor', 'Samsung F24T450',         1, 'SN-MN-002', 'IT Department',    'IT Room',             'Semi-Annual', 'Active', 'Ahmed Hussain'],
            ['Monitor', 'HP V24i FHD',             1, 'SN-MN-003', 'HR & Admin',       'HR Office',           'Semi-Annual', 'Active', 'Sara Khaled Youssef'],
            ['Monitor', 'LG 24MK430H',             1, 'SN-MN-004', 'Management',       'Manager Office',      'Annual',    'Active', 'Mohamed Awaad Hussein'],
            ['Monitor', 'Dell P2419H 24"',        1, 'SN-MN-005', 'Project Control',  'Project Room',        'Semi-Annual', 'Active', 'Shared'],
            // ── Printers ──
            ['Printer', 'HP LaserJet Pro M428',   1, 'SN-PR-001', 'HR & Admin',       'HR Office',           'Monthly',   'Active', 'Shared'],
            ['Printer', 'Canon ImageRunner 2206N', 1, 'SN-PR-002', 'Engineering',      'Line 1 Office',       'Monthly',   'Active', 'Shared'],
            ['Printer', 'Epson L6270',             1, 'SN-PR-003', 'IT Department',    'IT Room',             'Monthly',   'Active', 'Ahmed Hussain'],
            // ── Network Equipment ──
            ['Network Switch', 'Cisco SG110-24',  1, 'SN-NS-001', 'Networking',       'Server Room',         'Monthly',   'Active', 'Ahmed Hussain'],
            ['Network Switch', 'TP-Link TL-SG1024', 1, 'SN-NS-002', 'Networking',     'Line 1 Control Room', 'Monthly',   'Active', 'Ahmed Hussain'],
            ['Router',         'Cisco RV340',     1, 'SN-RT-001', 'Networking',       'Server Room',         'Monthly',   'Active', 'Ahmed Hussain'],
            // ── Phones ──
            ['IP Phone', 'Cisco CP-7841',          1, 'SN-IP-001', 'HR & Admin',       'HR Office',           'Annual',    'Active', 'Sara Khaled Youssef'],
            ['IP Phone', 'Cisco CP-7841',          1, 'SN-IP-002', 'Management',       'Manager Office',      'Annual',    'Active', 'Mohamed Awaad Hussein'],
            ['IP Phone', 'Cisco CP-7841',          1, 'SN-IP-003', 'Engineering',      'Line 1 Control Room', 'Annual',    'Active', 'Shared'],
            // ── UPS ──
            ['UPS', 'APC Smart-UPS 1500VA',       1, 'SN-UP-001', 'Power',            'Server Room',         'Monthly',   'Active', 'Ahmed Hussain'],
            ['UPS', 'APC Back-UPS 650VA',          1, 'SN-UP-002', 'Power',            'IT Room',             'Monthly',   'Active', 'Ahmed Hussain'],
            ['UPS', 'APC Back-UPS 650VA',          1, 'SN-UP-003', 'Power',            'HR Office',           'Monthly',   'Active', 'Sara Khaled Youssef'],
            // ── Cameras / Security ──
            ['IP Camera',  'Hikvision DS-2CD',    1, 'SN-CM-001', 'Security',         'Main Gate',           'Monthly',   'Active', 'Ahmed Hussain'],
            ['IP Camera',  'Hikvision DS-2CD',    1, 'SN-CM-002', 'Security',         'Server Room',         'Monthly',   'Active', 'Ahmed Hussain'],
            ['IP Camera',  'Hikvision DS-2CD',    1, 'SN-CM-003', 'Security',         'Line 1 Control Room', 'Monthly',   'Active', 'Ahmed Hussain'],
            // ── Tablets / Mobile ──
            ['Tablet', 'Samsung Galaxy Tab A8',   1, 'SN-TB-001', 'Maintenance',      'PM Office',           'Quarterly', 'Active', 'Khaled Mahmoud Ali'],
            ['Tablet', 'Lenovo Tab M10',           1, 'SN-TB-002', 'Engineering',      'Line 1 Office',       'Quarterly', 'Active', 'Mostafa Adel Nasser'],
            // ── Servers ──
            ['Server', 'Dell PowerEdge T40',      1, 'SN-SV-001', 'IT Infrastructure', 'Server Room',         'Weekly',    'Active', 'Ahmed Hussain'],
            // ── Misc ──
            ['Keyboard', 'Logitech K120',          5, 'SN-KB-001', 'IT Department',    'IT Stock',            'Annual',    'Active', 'Ahmed Hussain'],
            ['Mouse',    'Logitech B100',           5, 'SN-MS-001', 'IT Department',    'IT Stock',            'Annual',    'Active', 'Ahmed Hussain'],
            ['Projector', 'Epson EB-S41',          1, 'SN-PJ-001', 'Meeting',          'Meeting Room',        'Quarterly', 'Active', 'Shared'],
        ];

        $assetNos = [
            'Laptop'         => 'AST-LP-',
            'Desktop'        => 'AST-DT-',
            'Monitor'        => 'AST-MN-',
            'Printer'        => 'AST-PR-',
            'Network Switch' => 'AST-NS-',
            'Router'         => 'AST-RT-',
            'IP Phone'       => 'AST-IP-',
            'UPS'            => 'AST-UP-',
            'IP Camera'      => 'AST-CM-',
            'Tablet'         => 'AST-TB-',
            'Server'         => 'AST-SV-',
            'Keyboard'       => 'AST-KB-',
            'Mouse'          => 'AST-MS-',
            'Projector'      => 'AST-PJ-',
        ];

        $counter = [];
        $rows    = [];

        foreach ($assets as $a) {
            [$item, $name, $qty, $serial, $purpose, $location, $freq, $activity, $user] = $a;

            $prefix = $assetNos[$item] ?? 'AST-OT-';
            $counter[$item] = ($counter[$item] ?? 0) + 1;
            $assetNo = $prefix . str_pad($counter[$item], 3, '0', STR_PAD_LEFT);

            $rows[] = [
                'item'                => $item,
                'asset_no'            => $assetNo,
                'name'                => $name,
                'qty'                 => $qty,
                'serial_number'       => $serial,
                'purpose'             => $purpose,
                'location'            => $location,
                'registration_date'   => Carbon::now()->subMonths(rand(1, 36))->toDateString(),
                'account_registration'=> 'ACC-' . rand(1000, 9999),
                'user_name'           => $user,
                'managing_staff'      => 'Ahmed Hussain',
                'maintenance_frequency' => $freq,
                'activity'            => $activity,
                'notes'               => null,
                'created_by'          => 3,
                'created_at'          => $now,
                'updated_at'          => $now,
            ];
        }

        ITAsset::insert($rows);

        $this->command->info('ITAsset seeder: inserted ' . count($rows) . ' records.');
    }
}
