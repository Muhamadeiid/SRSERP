$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot "docker-stack-admin.log"
$dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Start-Transcript -Path $logPath -Append | Out-Null

Write-Host "Starting Docker Desktop and SRS ERP stack..." -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"

Write-Host "`nWSL distributions for this Windows user:" -ForegroundColor Yellow
wsl.exe -l -v

Write-Host "`nRestarting Docker Desktop..." -ForegroundColor Yellow
Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
wsl.exe --shutdown
Start-Service -Name com.docker.service -ErrorAction SilentlyContinue
Start-Process -FilePath $dockerDesktopExe

$ready = $false
for ($i = 1; $i -le 90; $i++) {
    Write-Host "Waiting for Docker Engine... attempt $i/90"
    & $dockerExe info *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 5
}

if (-not $ready) {
    Write-Host "`nDocker Engine did not become ready." -ForegroundColor Red
    & $dockerExe info
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host "`nDocker Engine is ready." -ForegroundColor Green
& $dockerExe version

Write-Host "`nBuilding and starting containers..." -ForegroundColor Yellow
Set-Location $repoRoot
& $dockerExe compose up -d --build
$composeExit = $LASTEXITCODE

Write-Host "`nContainer status:" -ForegroundColor Yellow
& $dockerExe compose ps

Stop-Transcript | Out-Null
exit $composeExit
