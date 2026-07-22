$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
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
& $Docker compose stop
Write-Host ""
Write-Host "SRS ERP stopped. Database files are still safe." -ForegroundColor Green
