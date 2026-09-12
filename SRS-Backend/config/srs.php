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

];
