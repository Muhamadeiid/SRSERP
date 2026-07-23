$ErrorActionPreference = 'Stop'
$log = 'C:\Users\RotemSRS_ERP\Desktop\mysql_setup.log'
Set-Content -Path $log -Value ("=== MYSQL SETUP " + (Get-Date) + " ===")

function Log($m) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

$mysqlDir = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64'
$dataDir = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-data'
$mysqld = Join-Path $mysqlDir 'bin\mysqld.exe'
$mysql = Join-Path $mysqlDir 'bin\mysql.exe'
$mysqladmin = Join-Path $mysqlDir 'bin\mysqladmin.exe'

Log "Verifying MySQL binaries..."
if (-not (Test-Path $mysqld)) { throw "mysqld.exe not found at $mysqld" }
Log "mysqld: $mysqld"

# Copy VC++ DLLs to MySQL bin folder too (MySQL also needs vcruntime140/msvcp140)
$edgeDir = Get-ChildItem 'C:\Program Files (x86)\Microsoft\Edge\Application' -Directory | Where-Object Name -match '^\d' | Select-Object -First 1
if ($edgeDir) {
    Log "Copying VC++ DLLs from Edge folder ($($edgeDir.Name)) to MySQL bin..."
    foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
        $src = Join-Path $edgeDir.FullName $dll
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $mysqlDir 'bin') -Force
            Log "  copied $dll"
        }
    }
}

# Create my.ini for portable operation
$myIni = @"
[mysqld]
basedir=$mysqlDir
datadir=$dataDir
port=3306
socket=$mysqlDir\mysql.sock
default_authentication_plugin=mysql_native_password
skip-networking=false
bind-address=0.0.0.0
max_connections=100
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
"@
$myIniPath = Join-Path $mysqlDir 'my.ini'
Set-Content -Path $myIniPath -Value $myIni -Encoding ASCII
Log "my.ini written: $myIniPath"

# Initialize data directory if empty
if (Test-Path $dataDir) {
    if ((Get-ChildItem $dataDir -ErrorAction SilentlyContinue).Count -gt 0) {
        Log "Data directory already initialized: $dataDir"
    } else {
        Log "Initializing data directory..."
        & $mysqld --initialize-insecure --datadir=$dataDir --basedir=$mysqlDir --console 2>&1 | ForEach-Object { Log "  $_" }
    }
} else {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Log "Initializing data directory..."
    & $mysqld --initialize-insecure --datadir=$dataDir --basedir=$mysqlDir --console 2>&1 | ForEach-Object { Log "  $_" }
}

# Kill any existing mysqld
Get-Process mysqld -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start mysqld in background
Log "Starting mysqld..."
$mysqldLog = 'C:\Users\RotemSRS_ERP\Desktop\mysqld.log'
Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$myIniPath","--datadir=$dataDir","--basedir=$mysqlDir","--console" -RedirectStandardOutput $mysqldLog -RedirectStandardError "$mysqldLog.err" -WindowStyle Hidden
Log "mysqld launched (PID logged separately)"

# Wait for MySQL to be ready
Log "Waiting for MySQL to accept connections..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $result = & $mysqladmin -h 127.0.0.1 -P 3306 -u root ping 2>&1
        if ($result -match 'alive') {
            $ready = $true
            Log "MySQL ready after $($i*2) seconds"
            break
        }
    } catch {}
}
if (-not $ready) {
    Log "WARNING: MySQL didn't respond in 60s. Check mysqld.log"
    exit 1
}

# Create the srs database
Log "Creating 'srs' database..."
& $mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS srs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1 | ForEach-Object { Log "  $_" }
Log "'srs' database ready"

# Rewrite Laravel .env for MySQL
$envPath = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend\.env'
$envContent = Get-Content $envPath -Raw
$envContent = $envContent -replace 'DB_CONNECTION=sqlite', 'DB_CONNECTION=mysql'
# Add MySQL settings if not present
if ($envContent -notmatch 'DB_HOST=') {
    $envContent += "`nDB_HOST=127.0.0.1`nDB_PORT=3306`nDB_DATABASE=srs`nDB_USERNAME=root`nDB_PASSWORD=`n"
} else {
    $envContent = $envContent -replace 'DB_HOST=.*', 'DB_HOST=127.0.0.1'
    $envContent = $envContent -replace 'DB_PORT=.*', 'DB_PORT=3306'
    $envContent = $envContent -replace 'DB_DATABASE=.*', 'DB_DATABASE=srs'
    $envContent = $envContent -replace 'DB_USERNAME=.*', 'DB_USERNAME=root'
    $envContent = $envContent -replace 'DB_PASSWORD=.*', 'DB_PASSWORD='
}
# Remove old SQLite DB_DATABASE path if present
$envContent = $envContent -replace '(?m)^DB_DATABASE=C:.*sqlite\r?\n', ''
Set-Content -Path $envPath -Value $envContent -Encoding ASCII
Log ".env updated for MySQL"

# Enable pdo_mysql extension in php.ini
$phpIni = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.ini'
$iniContent = Get-Content $phpIni -Raw
if ($iniContent -notmatch 'extension=pdo_mysql') {
    Add-Content -Path $phpIni -Value "`nextension=pdo_mysql`nextension=mysqli"
    Log "Enabled pdo_mysql + mysqli in php.ini"
}

# Run migrations on MySQL
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend'
Set-Location $bd

Log "Running artisan config:clear..."
& $php artisan config:clear 2>&1 | ForEach-Object { Log "  $_" }

Log "Running migrations on MySQL..."
& $php artisan migrate:fresh --force 2>&1 | ForEach-Object { Log "  $_" }

Log "Seeding users..."
& $php artisan db:seed --class=UsersSeeder --force 2>&1 | ForEach-Object { Log "  $_" }

Log "=== SETUP COMPLETE ==="
Log "MySQL: localhost:3306 (user=root, no password)"
Log "Database: srs"
Log ""
Log "Now start the PHP server:"
Log "  & '$php' -S 0.0.0.0:8000 -t '$bd\public'"
