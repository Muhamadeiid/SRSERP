param(
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvPath = Join-Path $Root ".env"
$ReadyEnvPath = Join-Path $Root ".env.server.ready"
$OfflineTar = Join-Path $Root "offline\srs-docker-images.tar"
$DockerConfigDir = Join-Path $Root ".srs-docker-config"

New-Item -ItemType Directory -Force -Path $DockerConfigDir | Out-Null
Set-Content -LiteralPath (Join-Path $DockerConfigDir "config.json") -Value '{"auths":{}}' -Encoding ascii
$env:DOCKER_CONFIG = $DockerConfigDir

function Write-Step($Message) {
    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
}

function Get-DockerCommand {
    $cmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $desktopDocker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path $desktopDocker) { return $desktopDocker }

    throw "Docker is not installed. Install Docker Desktop first."
}

function Ensure-DockerEngine($Docker) {
    try {
        & $Docker info *> $null
        return
    } catch {
        $desktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        if (Test-Path $desktop) {
            Write-Host "Starting Docker Desktop..." -ForegroundColor Yellow
            Start-Process -FilePath $desktop | Out-Null
            for ($i = 1; $i -le 60; $i++) {
                Start-Sleep -Seconds 3
                try {
                    & $Docker info *> $null
                    return
                } catch {
                    Write-Host "." -NoNewline
                }
            }
        }
    }

    throw "Docker Engine is not ready. Open Docker Desktop and wait until it finishes starting."
}

function Ensure-EnvFile {
    if (Test-Path $EnvPath) { return }
    $ExampleEnvPath = Join-Path $Root ".env.docker.example"
    if (Test-Path $ReadyEnvPath) {
        Copy-Item -LiteralPath $ReadyEnvPath -Destination $EnvPath
        Write-Host "Created .env from .env.server.ready" -ForegroundColor Green
    } elseif (Test-Path $ExampleEnvPath) {
        Copy-Item -LiteralPath $ExampleEnvPath -Destination $EnvPath
        Write-Host "Created .env from .env.docker.example" -ForegroundColor Green
    } else {
        Write-Host "No .env file found - using docker-compose defaults" -ForegroundColor Yellow
    }
}

function Get-EnvValue($Name, $Default) {
    if (-not (Test-Path $EnvPath)) { return $Default }
    $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    if (-not $line) { return $Default }
    return ($line -replace "^$Name=", "").Trim()
}

function Test-Image($Docker, $Image) {
    cmd.exe /c "`"$Docker`" image inspect `"$Image`" >NUL 2>NUL"
    return $LASTEXITCODE -eq 0
}

Set-Location $Root
$Docker = Get-DockerCommand

Write-Step "1/5 Checking Docker"
Ensure-DockerEngine $Docker

Write-Step "2/5 Preparing settings"
Ensure-EnvFile

Write-Step "3/5 Checking Docker images"
$hasDb = Test-Image $Docker "mysql:8.0"
$hasApi = Test-Image $Docker "srs-erp-api:latest"
$hasFrontend = Test-Image $Docker "srs-erp-frontend:latest"

if ((-not ($hasDb -and $hasApi -and $hasFrontend)) -and (Test-Path $OfflineTar)) {
    Write-Host "Loading offline Docker package..." -ForegroundColor Yellow
    & $Docker load -i $OfflineTar
}

$hasDb = Test-Image $Docker "mysql:8.0"
$hasApi = Test-Image $Docker "srs-erp-api:latest"
$hasFrontend = Test-Image $Docker "srs-erp-frontend:latest"

if (-not ($hasDb -and $hasApi -and $hasFrontend)) {
    Write-Host "Some images are missing, building now. First time needs internet." -ForegroundColor Yellow
    & $Docker compose build
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }
}

Write-Step "4/5 Starting SRS ERP"
& $Docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Docker start failed." }

Write-Step "5/5 Checking containers"
& $Docker compose ps

$frontendPort = Get-EnvValue "FRONTEND_PORT" "5175"
$url = "http://127.0.0.1:$frontendPort/login"

Write-Host ""
Write-Host "SRS ERP is ready." -ForegroundColor Green
Write-Host "Open on this server: $url" -ForegroundColor White
Write-Host "From company PCs: http://SERVER-IP:$frontendPort/login" -ForegroundColor White
Write-Host ""
Write-Host "Default login:" -ForegroundColor Yellow
Write-Host "Email: admin@srs.com"
Write-Host "Password: password"

if (-not $NoOpen) {
    Start-Process $url
}
