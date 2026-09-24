<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Inventory Specialist
    |--------------------------------------------------------------------------
    |
    | The "Inventory Responsibility" signatory printed on every Release Note
    | (SRS-INV-P01-F06). Leave this null to let the app pick the active
    | employee whose position contains "Inventory"; set it to an employees.id
    | to pin one specific person.
    |
    */

    'inventory_specialist_employee_id' => env('SRS_INVENTORY_SPECIALIST_EMPLOYEE_ID'),

    /*
    |--------------------------------------------------------------------------
    | Local wall-clock timezone
    |--------------------------------------------------------------------------
    |
    | Calendar events, overtime shifts and similar schedules are stored as the
    | local time people typed ("10:00"), while the app clock runs in UTC.
    | Reminder jobs compare against now() in this zone so a 10:00 meeting is
    | announced at 09:45 Cairo time, not 09:45 UTC (three hours late).
    |
    */

    'local_timezone' => env('SRS_LOCAL_TIMEZONE', 'Africa/Cairo'),

    /*
    |--------------------------------------------------------------------------
    | Procurement direct-order categories
    |--------------------------------------------------------------------------
    |
    | Comma-separated category names or codes that may use the urgent direct
    | order exception. Values are matched case-insensitively and may be either
    | the stored label ("Office Supplies") or a short code ("STAT").
    |
    */

    'direct_order_categories' => array_values(array_filter(array_map(
        'trim',
        explode(',', env(
            'SRS_DIRECT_ORDER_CATEGORIES',
            'STAT,Stationery,Stationary,Office,Office Supplies,Transport,Transportation'
        ))
    ))),

];
