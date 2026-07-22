$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OfflineDir = Join-Path $Root "offline"
$TarPath = Join-Path $OfflineDir "srs-docker-images.tar"
$DockerConfigDir = Join-Path $Root ".srs-docker-config"
New-Item -ItemType Directory -Force -Path $DockerConfigDir | Out-Null
Set-Content -LiteralPath (Join-Path $DockerConfigDir "config.json") -Value '{"auths":{}}' -Encoding ascii
$env:DOCKER_CONFIG = $DockerConfigDir
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$Docker = $null
if ($dockerCmd) { $Docker = $dockerCmd.Source }
if (-not $Docker) { $Docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe" }
if (-not (Test-Path $Docker)) { throw "Docker was not found." }

Set-Location $Root
New-Item -ItemType Directory -Force -Path $OfflineDir | Out-Null

Write-Host "Building Docker images..." -ForegroundColor Cyan
& $Docker compose build
if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }

Write-Host "Making sure MySQL image exists..." -ForegroundColor Cyan
& $Docker pull mysql:8.0
if ($LASTEXITCODE -ne 0) { throw "Could not pull mysql:8.0." }

Write-Host "Saving offline package. This can take a while..." -ForegroundColor Cyan
& $Docker save mysql:8.0 srs-erp-api:latest srs-erp-frontend:latest -o $TarPath
if ($LASTEXITCODE -ne 0) { throw "Docker save failed." }

Write-Host ""
Write-Host "Offline Docker package is ready:" -ForegroundColor Green
Write-Host $TarPath
Write-Host ""
Write-Host "Copy the whole project folder to the server. The START file will load this package automatically if needed." -ForegroundColor Yellow
