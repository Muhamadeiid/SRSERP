$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot "docker-setup-admin.log"

Start-Transcript -Path $logPath -Append | Out-Null

Write-Host "Enabling Windows features required by Docker Desktop..." -ForegroundColor Cyan

Write-Host "`n1/3 Enabling Windows Subsystem for Linux..." -ForegroundColor Yellow
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host "`n2/3 Enabling Virtual Machine Platform..." -ForegroundColor Yellow
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host "`n3/3 Checking WSL status..." -ForegroundColor Yellow
wsl.exe --status

Write-Host "`nTrying to start Docker Desktop service..." -ForegroundColor Yellow
Start-Service -Name com.docker.service -ErrorAction SilentlyContinue
Get-Service -Name com.docker.service -ErrorAction SilentlyContinue | Format-List Name,Status,StartType

Write-Host "`nDone. If Windows asks for restart, restart the PC, then open Docker Desktop." -ForegroundColor Green
Write-Host "Log saved to: $logPath" -ForegroundColor Green

Stop-Transcript | Out-Null

Read-Host "Press Enter to close"
