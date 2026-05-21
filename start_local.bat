@echo off
title SRS Local Dev

echo Starting Backend (Laravel)...
start "SRS Backend" cmd /k "cd /d C:\Users\elash\srserp\SRS-Backend && php artisan serve --host=127.0.0.1 --port=8000"

timeout /t 2 /nobreak >nul

echo Starting Frontend (Vite)...
start "SRS Frontend" cmd /k "cd /d \"C:\Users\elash\srserp\Frontend - Copy\" && npm run dev"

echo.
echo =========================================
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:5173
echo  Login    : http://localhost:5173/login
echo =========================================
pause
