param(
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvPath = Join-Path $Root ".env"
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

if (-not $BackupFile) {
    $BackupFile = Read-Host "Paste the full backup .sql file path"
}

if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

$database = Get-EnvValue "MYSQL_DATABASE" "srs"
$password = Get-EnvValue "MYSQL_ROOT_PASSWORD" "srs_root_password"

Write-Host "Restoring backup. This will overwrite current database data." -ForegroundColor Yellow
$confirm = Read-Host "Type RESTORE to continue"
if ($confirm -ne "RESTORE") {
    Write-Host "Restore cancelled." -ForegroundColor Yellow
    exit 0
}

Set-Location $Root
$escapedPath = $BackupFile.Replace('"', '\"')
$cmd = "type `"$escapedPath`" | `"$Docker`" exec -i srs-erp-db mysql -uroot -p$password $database"
cmd.exe /c $cmd

Write-Host ""
Write-Host "Restore finished." -ForegroundColor Green
