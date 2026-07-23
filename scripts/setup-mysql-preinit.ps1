$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$log = 'C:\Users\RotemSRS_ERP\Desktop\mysql_final.log'
function Log($m) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}
Set-Content -Path $log -Value ("=== FINAL MYSQL SETUP " + (Get-Date) + " ===")

# Kill any hanging mysqld
Get-Process mysqld -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2

$mysqlDir = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64'
$dataDir = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-data'
$mysqld = Join-Path $mysqlDir 'bin\mysqld.exe'
$mysql = Join-Path $mysqlDir 'bin\mysql.exe'
$mysqladmin = Join-Path $mysqlDir 'bin\mysqladmin.exe'

# Copy VC++ DLLs to MySQL bin (in case setup script didn't earlier)
$edgeDir = Get-ChildItem 'C:\Program Files (x86)\Microsoft\Edge\Application' -Directory -EA SilentlyContinue | Where-Object Name -match '^\d' | Select-Object -First 1
if ($edgeDir) {
    foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
        $src = Join-Path $edgeDir.FullName $dll
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $mysqlDir 'bin') -Force -EA SilentlyContinue
        }
    }
    Log "DLLs copied from Edge folder"
}

# Download pre-initialized data
Log "Downloading pre-initialized mysql-data.zip..."
$dataZip = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-data.zip'
Invoke-WebRequest -Uri 'https://github.com/Muhamadeiid/SRSERP/releases/download/v-mysql-portable-2026-07-23/mysql-data.zip' -OutFile $dataZip -UseBasicParsing
Log "Downloaded: $((Get-Item $dataZip).Length) bytes"

Remove-Item $dataDir -Recurse -Force -EA SilentlyContinue
Log "Extracting..."
Expand-Archive -Path $dataZip -DestinationPath 'C:\Users\RotemSRS_ERP\srs_stack' -Force
Log "Data dir: $(Test-Path (Join-Path $dataDir 'mysql'))"

# Write my.ini
$myIni = @"
[mysqld]
basedir=$mysqlDir
datadir=$dataDir
port=3306
bind-address=0.0.0.0
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
max_connections=100
"@
$myIniPath = Join-Path $mysqlDir 'my.ini'
Set-Content -Path $myIniPath -Value $myIni -Encoding ASCII
Log "my.ini written"

# Start mysqld
Log "Starting mysqld..."
$mysqldOut = 'C:\Users\RotemSRS_ERP\Desktop\mysqld-out.log'
$mysqldErr = 'C:\Users\RotemSRS_ERP\Desktop\mysqld-err.log'
Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$myIniPath" -RedirectStandardOutput $mysqldOut -RedirectStandardError $mysqldErr -WindowStyle Hidden
Log "mysqld process launched"

# Wait for ready
Log "Waiting for MySQL to accept connections..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep 2
    try {
        $result = & $mysqladmin -h 127.0.0.1 -P 3306 -u root ping 2>&1
        if ($result -match 'alive') {
            $ready = $true
            Log "MySQL ready after $($i*2)s"
            break
        }
    } catch {}
}
if (-not $ready) {
    Log "TIMEOUT waiting for MySQL. Check mysqld-err.log"
    if (Test-Path $mysqldErr) { Get-Content $mysqldErr -Tail 10 | ForEach-Object { Log "  ERR: $_" } }
    exit 1
}

# Create srs database
Log "Creating 'srs' database..."
& $mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS srs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1 | ForEach-Object { Log "  $_" }

# Update Laravel .env for MySQL
Log "Updating Laravel .env..."
$envPath = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\.env'
$envContent = @"
APP_NAME=SRS
APP_ENV=production
APP_KEY=$(([Regex]::Match((Get-Content $envPath -Raw), 'APP_KEY=(.+)')).Groups[1].Value)
APP_DEBUG=false
APP_URL=http://localhost:8000

LOG_CHANNEL=stack
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=srs
DB_USERNAME=root
DB_PASSWORD=

CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

FILESYSTEM_DISK=local
MAIL_MAILER=log

FRONTEND_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
SANCTUM_STATEFUL_DOMAINS=localhost:8000,127.0.0.1:8000
"@
Set-Content -Path $envPath -Value $envContent -Encoding ASCII
Log ".env rewritten"

# Ensure pdo_mysql in php.ini
$phpIni = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.ini'
$iniContent = Get-Content $phpIni -Raw
if ($iniContent -notmatch '(?m)^extension=pdo_mysql') {
    Add-Content -Path $phpIni -Value "extension=pdo_mysql`nextension=mysqli"
    Log "Added pdo_mysql to php.ini"
}

# Run migrations
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend'
Set-Location $bd

Log "artisan config:clear..."
& $php artisan config:clear 2>&1 | ForEach-Object { Log "  $_" }

Log "artisan migrate:fresh --force (this takes ~1 min)..."
& $php artisan migrate:fresh --force 2>&1 | ForEach-Object { Log "  $_" }

Log "artisan db:seed UsersSeeder --force..."
& $php artisan db:seed --class=UsersSeeder --force 2>&1 | ForEach-Object { Log "  $_" }

# Start PHP built-in server
Log "Starting PHP HTTP server on 0.0.0.0:8000..."
Start-Process -FilePath $php -ArgumentList "-S","0.0.0.0:8000","-t","$bd\public" -WorkingDirectory $bd -RedirectStandardOutput 'C:\Users\RotemSRS_ERP\Desktop\php-server-out.log' -RedirectStandardError 'C:\Users\RotemSRS_ERP\Desktop\php-server-err.log' -WindowStyle Hidden

Start-Sleep 3

# Test the endpoint
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 5
    Log "HTTP $($r.StatusCode) - $($r.Content.Length) bytes returned"
    Log "SUCCESS! Site is up at http://localhost:8000"
} catch {
    Log "HTTP test failed: $($_.Exception.Message)"
}

Log "=== SETUP COMPLETE ==="
Log ""
Log "URL:    http://localhost:8000"
Log "Login:  admin@srs.com / password"
