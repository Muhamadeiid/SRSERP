@echo off
REM Double-click to update SRS ERP from GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\srs-update.ps1"
pause
