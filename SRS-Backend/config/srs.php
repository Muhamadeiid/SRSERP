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
