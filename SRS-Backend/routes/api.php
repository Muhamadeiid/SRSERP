<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\EmployeeAssetController;
use App\Http\Controllers\ITAssetController;
use App\Http\Controllers\ClearanceReportController;
use App\Http\Controllers\LeaveRequestController;
use App\Http\Controllers\LeaveBalanceController;
use App\Http\Controllers\PrfController;
use App\Http\Controllers\PurchaseOrderController;
use App\Http\Controllers\IgiController;
use App\Http\Controllers\SignatureController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\LookupController;
use App\Http\Controllers\PositionController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\TeamTransferController;
use App\Http\Controllers\AssignmentRuleController;
use App\Http\Controllers\ProjectController;
use Illuminate\Support\Facades\Route;

// ── Public ────────────────────────────────────────────────────────────────────
Route::post('/auth/login', [AuthController::class, 'login']);

// ── Authenticated (all roles) ─────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // Auth & profile
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me',      [AuthController::class, 'me']);

    // Lookups — active items only (read-only for all authenticated users)
    Route::get('/lookups', [LookupController::class, 'index']);

    // Positions — read-only for all (autocomplete on forms)
    Route::get('/positions', [PositionController::class, 'index']);

    // Projects — read-only for all (project code display)
    Route::get('/projects', [ProjectController::class, 'index']);

    // E-Signature (own)
    Route::post('/user/signature', [SignatureController::class, 'saveMySignature']);
    Route::get('/user/me',         [SignatureController::class, 'me']);

    // ── Leave Requests & Overtime — every authenticated user can submit ────────
    Route::get('/leave-requests/calendar',                        [LeaveRequestController::class, 'calendar']);
    Route::get('/leave-requests',                                 [LeaveRequestController::class, 'index']);
    Route::post('/leave-requests',                                [LeaveRequestController::class, 'store']);
    Route::get('/leave-requests/{leaveRequest}',                  [LeaveRequestController::class, 'show']);
    Route::post('/leave-requests/{leaveRequest}/manager-approve', [LeaveRequestController::class, 'managerApprove']);
    Route::post('/leave-requests/{leaveRequest}/approve',         [LeaveRequestController::class, 'approve']);
    Route::post('/leave-requests/{leaveRequest}/reject',          [LeaveRequestController::class, 'reject']);
    Route::post('/leave-requests/{leaveRequest}/cancel',          [LeaveRequestController::class, 'cancel']);
    Route::post('/leave-requests/{leaveRequest}/reschedule',      [LeaveRequestController::class, 'reschedule']);
    Route::put('/leave-requests/{leaveRequest}/tracking-no',      [LeaveRequestController::class, 'updateTrackingNo']);

    // ── Notifications — every authenticated user ──────────────────────────────
    Route::get('/notifications',           [LeaveRequestController::class, 'notifications']);
    Route::post('/notifications/read-all', [LeaveRequestController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read',[LeaveRequestController::class, 'markRead']);

    // ── Subordinates — any manager can fetch their own ────────────────────────
    Route::get('/users/subordinates', [UserController::class, 'subordinates']);

    // ── Depot Manager & HR — any authenticated user (auto-fill on forms) ──────
    Route::get('/users/depot-manager', [UserController::class, 'depotManager']);
    Route::get('/users/hr-officer',    [UserController::class, 'hrOfficer']);

    // ── Procurement (PRF) — every authenticated user can submit; approvals
    //     gated inside the controller (procurement → ehs → depot_manager)
    Route::prefix('procurement')->group(function () {
        Route::get('/prfs',                  [PrfController::class, 'index']);
        Route::post('/prfs',                 [PrfController::class, 'store']);
        Route::get('/prfs/{prf}',            [PrfController::class, 'show']);
        Route::post('/prfs/{prf}/approve',     [PrfController::class, 'approve']);
        Route::post('/prfs/{prf}/reject',      [PrfController::class, 'reject']);
        Route::put('/prfs/{prf}/tracking-no',  [PrfController::class, 'updateTrackingNo']);

        // Purchase Orders — Admin, Depot Manager, Purchasing only (gated in controller)
        Route::get('/pos',          [PurchaseOrderController::class, 'index']);
        Route::post('/pos',         [PurchaseOrderController::class, 'store']);
        Route::get('/pos/{po}',     [PurchaseOrderController::class, 'show']);
        Route::put('/pos/{po}',     [PurchaseOrderController::class, 'update']);

        // Incoming Goods Inspection — Admin, Depot Manager, Purchasing only (gated in controller)
        Route::get('/igis',         [IgiController::class, 'index']);
        Route::post('/igis',        [IgiController::class, 'store']);
        Route::get('/igis/{igi}',   [IgiController::class, 'show']);
        Route::put('/igis/{igi}',   [IgiController::class, 'update']);
    });

    // ── Employee search — all authenticated users (for leave request autocomplete)
    Route::get('/employees/autocomplete', [EmployeeController::class, 'autocomplete']);

    // ── HR Only — Admin, Depot Manager, HR department ─────────────────────────
    Route::middleware('hr.only')->group(function () {

        // Workforce & Employees
        Route::get('/employees',                                  [EmployeeController::class, 'index']);
        Route::post('/employees',                                 [EmployeeController::class, 'store']);
        Route::get('/employees/stats',                            [EmployeeController::class, 'stats']);
        Route::post('/employees/import',                          [EmployeeController::class, 'import']);
        Route::get('/employees/export',                           [EmployeeController::class, 'export']);
        Route::get('/employees/org-chart',                        [EmployeeController::class, 'orgChart']);
        Route::put('/employees/{employee}/manager',               [EmployeeController::class, 'updateManager']);
        Route::get('/employees/{employee}',                       [EmployeeController::class, 'show']);
        Route::put('/employees/{employee}',                       [EmployeeController::class, 'update']);
        Route::delete('/employees/{employee}',                    [EmployeeController::class, 'destroy']);
        Route::get('/employees/{employee}/leave-balance',         [LeaveBalanceController::class, 'show']);
        Route::put('/employees/{employee}/leave-balance',         [LeaveBalanceController::class, 'update']);
        Route::post('/employees/{employee}/signature',            [SignatureController::class, 'saveEmployeeSignature']);

        // Attendance
        Route::prefix('attendance')->group(function () {
            Route::get('/',                          [AttendanceController::class, 'index']);
            Route::post('/upload',                   [AttendanceController::class, 'upload']);
            Route::post('/upload-excel',             [AttendanceController::class, 'uploadExcel']);
            Route::post('/manual',                   [AttendanceController::class, 'manual']);
            Route::get('/summary/{employee_id}',     [AttendanceController::class, 'summary']);
            Route::delete('/{id}',                   [AttendanceController::class, 'destroy']);
            Route::get('/export',                    [AttendanceController::class, 'exportExcel']);
            Route::get('/export-all',                [AttendanceController::class, 'exportAllExcel']);
            Route::get('/logs',                      [AttendanceController::class, 'logs']);
        });

        // Employee Assets & Clearance
        Route::get('/assets/stats',                              [EmployeeAssetController::class, 'stats']);
        Route::get('/assets/clearance/{employee_id}',            [EmployeeAssetController::class, 'clearance']);
        Route::get('/assets/clearance/{employee_id}/report',     [ClearanceReportController::class, 'generate']);
        Route::get('/assets',                                    [EmployeeAssetController::class, 'index']);
        Route::post('/assets',                                   [EmployeeAssetController::class, 'store']);
        Route::get('/assets/{asset}',                            [EmployeeAssetController::class, 'show']);
        Route::put('/assets/{asset}',                            [EmployeeAssetController::class, 'update']);
        Route::delete('/assets/{asset}',                         [EmployeeAssetController::class, 'destroy']);
        Route::post('/assets/{asset}/return',                    [EmployeeAssetController::class, 'markReturned']);

        // IT Asset Register
        Route::get('/it-assets',              [ITAssetController::class, 'index']);
        Route::post('/it-assets',             [ITAssetController::class, 'store']);
        Route::put('/it-assets/{itAsset}',    [ITAssetController::class, 'update']);
        Route::delete('/it-assets/{itAsset}', [ITAssetController::class, 'destroy']);

        // Settings
        Route::get('/settings',                            [SettingsController::class, 'index']);
        Route::post('/settings',                           [SettingsController::class, 'update']);
        Route::get('/settings/managers',                   [SettingsController::class, 'managers']);
        Route::get('/settings/manager/{userId}/employees', [SettingsController::class, 'managerEmployees']);
        Route::post('/settings/assign',                    [SettingsController::class, 'assignEmployee']);

    }); // end hr.only

    // ── Admin Only ────────────────────────────────────────────────────────────
    Route::middleware('admin.only')->group(function () {
        Route::get('/users',                           [UserController::class, 'index']);
        Route::post('/users',                          [UserController::class, 'store']);
        Route::put('/users/{user}',                    [UserController::class, 'update']);
        Route::delete('/users/{user}',                 [UserController::class, 'destroy']);
        Route::post('/users/{user}/reset-password',    [UserController::class, 'resetPassword']);
        Route::post('/users/{user}/signature',         [UserController::class, 'saveSignature']);
        Route::get('/users/managers',                  [UserController::class, 'managers']);
        Route::get('/users/{user}/assigned-employees', [UserController::class, 'assignedEmployees']);
        Route::post('/users/{user}/assign-employee',   [UserController::class, 'assignEmployee']);
        Route::post('/users/{user}/link-employee',     [UserController::class, 'linkEmployee']);

        // Lookups — admin management
        Route::get('/lookups/all',           [LookupController::class, 'all']);
        Route::post('/lookups',              [LookupController::class, 'store']);
        Route::put('/lookups/{lookup}',      [LookupController::class, 'update']);
        Route::delete('/lookups/{lookup}',   [LookupController::class, 'destroy']);

        // Positions — admin management
        Route::get('/positions/all',              [PositionController::class, 'all']);
        Route::post('/positions',                 [PositionController::class, 'store']);
        Route::put('/positions/{position}',       [PositionController::class, 'update']);
        Route::delete('/positions/{position}',    [PositionController::class, 'destroy']);
        Route::post('/positions/merge',           [PositionController::class, 'merge']);

        // Permissions matrix
        Route::get('/permissions/matrix',         [PermissionController::class, 'matrix']);
        Route::post('/permissions/toggle',        [PermissionController::class, 'toggle']);

        // Team Transfer (bulk reorg)
        Route::post('/team-transfer',             [TeamTransferController::class, 'transfer']);

        // Projects — admin management (create/edit/delete)
        Route::post('/projects',              [ProjectController::class, 'store']);
        Route::put('/projects/{project}',     [ProjectController::class, 'update']);
        Route::delete('/projects/{project}',  [ProjectController::class, 'destroy']);

        // Assignment Rules (auto direct-manager by position/department)
        Route::get('/assignment-rules',              [AssignmentRuleController::class, 'index']);
        Route::post('/assignment-rules',             [AssignmentRuleController::class, 'store']);
        Route::put('/assignment-rules/{assignmentRule}',    [AssignmentRuleController::class, 'update']);
        Route::delete('/assignment-rules/{assignmentRule}', [AssignmentRuleController::class, 'destroy']);
        Route::post('/assignment-rules/apply',       [AssignmentRuleController::class, 'apply']);
    });
});
