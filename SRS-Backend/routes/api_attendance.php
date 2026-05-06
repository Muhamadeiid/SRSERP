<?php

use App\Http\Controllers\AttendanceController;
use Illuminate\Support\Facades\Route;


Route::middleware(['auth:sanctum'])->group(function () {

    // Attendance routes
    Route::prefix('attendance')->group(function () {

        // Upload biometric file
        Route::post('/upload', [AttendanceController::class, 'upload']);

        // Get attendance records (with filters)
        Route::get('/', [AttendanceController::class, 'index']);

        // Create manual entry
        Route::post('/manual', [AttendanceController::class, 'manual']);

        // Get employee summary
        Route::get('/summary/{employee_id}', [AttendanceController::class, 'summary']);

        // Delete attendance record
        Route::delete('/{id}', [AttendanceController::class, 'destroy']);
    });

});
