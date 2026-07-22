$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$stack = 'C:\Users\RotemSRS_ERP\srs_stack'
$logFile = 'C:\Users\RotemSRS_ERP\Desktop\deploy_log.txt'

function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

Set-Content -Path $logFile -Value ("=== DEPLOY START " + (Get-Date) + " ===")

$phpDir = Join-Path $stack 'php'
$nodeDir = Join-Path $stack 'node_msi\PFiles64\nodejs'
$composerPhar = Join-Path $stack 'composer.phar'
$srserpDir = Join-Path $stack 'srserp'
$backendDir = Join-Path $srserpDir 'SRS-Backend'
$frontendDir = Join-Path $srserpDir 'Frontend - Copy'

Log "Verifying tools..."
if (-not (Test-Path (Join-Path $phpDir 'php.exe'))) { throw "PHP not found at $phpDir" }
if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) { throw "Node not found at $nodeDir" }
if (-not (Test-Path $composerPhar)) { throw "Composer not found at $composerPhar" }

Log "Configuring php.ini..."
$phpIni = Join-Path $phpDir 'php.ini'
if (-not (Test-Path $phpIni)) {
    Copy-Item (Join-Path $phpDir 'php.ini-development') $phpIni -Force
}
$ini = Get-Content $phpIni -Raw
$ini = $ini -replace '(?m)^;extension_dir = "ext"', 'extension_dir = "ext"'
$exts = @('curl', 'fileinfo', 'gd', 'mbstring', 'openssl', 'pdo_mysql', 'pdo_sqlite', 'sqlite3', 'zip', 'bcmath', 'exif', 'intl')
foreach ($ext in $exts) {
    $ini = $ini -replace ("(?m)^;extension=" + [regex]::Escape($ext) + "$"), ("extension=" + $ext)
}
$ini = $ini -replace '(?m)^;memory_limit = 128M', 'memory_limit = 512M'
Set-Content -Path $phpIni -Value $ini -Encoding ASCII
Log "php.ini configured"

Log "Testing PHP..."
& (Join-Path $phpDir 'php.exe') -v 2>&1 | ForEach-Object { Log $_ }

Log "Copying srserp source..."
if (-not (Test-Path $srserpDir)) {
    $src = 'C:\Users\RotemSRS_ERP\Documents\srserp'
    if (Test-Path $src) {
        Copy-Item $src -Destination $stack -Recurse -Force
    } else {
        Log "Documents source missing - downloading from GitHub..."
        $zipPath = Join-Path $stack 'srserp.zip'
        Invoke-WebRequest -Uri 'https://github.com/Muhamadeiid/SRSERP/archive/refs/heads/main.zip' -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $stack -Force
        Rename-Item (Join-Path $stack 'SRSERP-main') 'srserp' -Force
    }
}
Log "srserp copied"

Log "Creating SQLite database file..."
$dbDir = Join-Path $backendDir 'database'
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
$dbFile = Join-Path $dbDir 'database.sqlite'
if (-not (Test-Path $dbFile)) { New-Item -ItemType File -Force -Path $dbFile | Out-Null }
Log "SQLite file: $dbFile"

Log "Writing .env for backend..."
$envContent = @"
APP_NAME=SRS
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=http://localhost:8000

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=sqlite
DB_DATABASE=$dbFile

CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

FILESYSTEM_DISK=local
MAIL_MAILER=log

FRONTEND_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
SANCTUM_STATEFUL_DOMAINS=localhost:8000,127.0.0.1:8000
"@
Set-Content -Path (Join-Path $backendDir '.env') -Value $envContent -Encoding ASCII
Log ".env written"

Log "Running composer install (this takes 5-10 minutes)..."
Push-Location $backendDir
try {
    & (Join-Path $phpDir 'php.exe') $composerPhar install --no-dev --optimize-autoloader --no-interaction --no-progress 2>&1 | ForEach-Object { Log $_ }
} finally {
    Pop-Location
}
Log "composer install done"

Log "Generating APP_KEY..."
Push-Location $backendDir
try {
    & (Join-Path $phpDir 'php.exe') artisan key:generate --force 2>&1 | ForEach-Object { Log $_ }
} finally {
    Pop-Location
}

Log "Running migrations..."
Push-Location $backendDir
try {
    & (Join-Path $phpDir 'php.exe') artisan migrate --force 2>&1 | ForEach-Object { Log $_ }
    & (Join-Path $phpDir 'php.exe') artisan db:seed --class=UsersSeeder --force 2>&1 | ForEach-Object { Log $_ }
} finally {
    Pop-Location
}
Log "Migrations + seed done"

Log "Building frontend..."
$env:PATH = "$nodeDir;$env:PATH"
Push-Location $frontendDir
try {
    Log "npm install..."
    & (Join-Path $nodeDir 'npm.cmd') install --no-audit --no-fund 2>&1 | Select-Object -Last 20 | ForEach-Object { Log $_ }
    Log "npm run build..."
    $env:VITE_API_URL = '/api'
    $env:VITE_API_BASE = '/api'
    & (Join-Path $nodeDir 'npm.cmd') run build 2>&1 | Select-Object -Last 20 | ForEach-Object { Log $_ }
} finally {
    Pop-Location
}
Log "Frontend built"

Log "Copying frontend dist into backend/public..."
$distDir = Join-Path $frontendDir 'dist'
$publicDir = Join-Path $backendDir 'public'
if (Test-Path $distDir) {
    Copy-Item (Join-Path $distDir '*') $publicDir -Recurse -Force
    Log "Frontend copied to backend/public"
} else {
    Log "WARN: dist folder not found"
}

Log "=== DEPLOY COMPLETE ==="
Log "Backend: $backendDir"
Log "PHP: $phpDir\php.exe"
Log "Node: $nodeDir\node.exe"
Log ""
Log "To start the app, run:"
Log "  & '$phpDir\php.exe' -S 0.0.0.0:8000 -t '$backendDir\public'"
