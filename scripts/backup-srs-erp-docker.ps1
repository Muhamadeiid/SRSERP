$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvPath = Join-Path $Root ".env"
$BackupDir = Join-Path $Root "backups"
$DockerConfigDir = Join-Path $Root ".srs-docker-config"
New-Item -ItemType Directory -Force -Path $DockerConfigDir | Out-Null
Set-Content -LiteralPath (Join-Path $DockerConfigDir "config.json") -Value '{"auths":{}}' -Encoding ascii
$env:DOCKER_CONFIG = $DockerConfigDir
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$Docker = $null
if ($dockerCmd) { $Docker = $dockerCmd.Source }
if (-not $Docker) { $Docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe" }
if (-not (Test-Path $Docker)) { throw "Docker was not found." }

function Get-EnvValue($Name, $Default) {
    if (-not (Test-Path $EnvPath)) { return $Default }
    $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    if (-not $line) { return $Default }
    return ($line -replace "^$Name=", "").Trim()
}

$database = Get-EnvValue "MYSQL_DATABASE" "srs"
$password = Get-EnvValue "MYSQL_ROOT_PASSWORD" "srs_root_password"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $BackupDir "srs-backup-$stamp.sql"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
Set-Location $Root

Write-Host "Creating database backup..." -ForegroundColor Cyan
& $Docker exec srs-erp-db mysqldump -uroot "-p$password" $database | Out-File -FilePath $file -Encoding utf8

Write-Host ""
Write-Host "Backup created:" -ForegroundColor Green
Write-Host $file
Write-Host ""
Write-Host "Copy this file to an external drive or safe network folder." -ForegroundColor Yellow
