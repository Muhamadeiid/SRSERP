@echo off
setlocal

echo ==========================================
echo  SRS Frontend LAN Build
echo ==========================================
echo.
set /p SERVER_IP="Enter company server IP (example: 192.168.1.100): "

set FRONTEND_DIR=%~dp0..\Frontend - Copy

echo VITE_API_URL=http://%SERVER_IP%:8000/api> "%FRONTEND_DIR%\.env.production"
echo VITE_API_BASE=http://%SERVER_IP%:8000/api>> "%FRONTEND_DIR%\.env.production"
echo.
echo Frontend production env created:
echo   http://%SERVER_IP%:8000/api
echo.

cd /d "%FRONTEND_DIR%"
echo Building frontend...
call npm run build

echo.
echo Done. Frontend files are in:
echo   %FRONTEND_DIR%\dist
echo.
pause
