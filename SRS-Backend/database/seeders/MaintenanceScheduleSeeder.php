<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class MaintenanceScheduleSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        $order = ['01', '02', '12', '04', '13', '03', '14', '07', '05', '06', '15', '09', '10', '16', '08', '11', '17', '18', '19', '20'];
        DB::table('trains')->upsert(array_map(fn ($id, $index) => [
            'id' => $id, 'name' => "Train {$id}", 'display_order' => $index + 1,
            'created_at' => $now, 'updated_at' => $now,
        ], $order, array_keys($order)), ['id'], ['name', 'display_order', 'updated_at']);

        $codes = [
            ['A', 'Type A Inspection', '#FFEB3B', false], ['B1', 'Type B1 Maintenance', '#8BC34A', false],
            ['B2', 'Type B2 Maintenance', '#8BC34A', false], ['B3', 'Type B3 Maintenance', '#8BC34A', false],
            ['C', 'Type C Service', '#FFFFFF', false], ['A+C', 'Combined A+C', '#9C27B0', false],
            ['G', 'Type G Maintenance', '#2196F3', false], ['9Y', '9-Year Overhaul', '#F44336', true],
        ];
        DB::table('maintenance_codes')->upsert(array_map(fn ($item) => [
            'code' => $item[0], 'name' => $item[1], 'color_hex' => $item[2],
            'exclude_from_reminders' => $item[3], 'created_at' => $now, 'updated_at' => $now,
        ], $codes), ['code'], ['name', 'color_hex', 'exclude_from_reminders', 'updated_at']);
    }
}
