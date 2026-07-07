@echo off
title SRS ERP LAN Startup

powershell -ExecutionPolicy Bypass -File "%~dp0start-srs.ps1"
pause
