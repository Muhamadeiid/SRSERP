$ErrorActionPreference = 'SilentlyContinue'
$stack = 'C:\Users\RotemSRS_ERP\srs_stack'
$mysqlDir = Join-Path $stack 'mysql-8.4.6-winx64'
$mysqld = Join-Path $mysqlDir 'bin\mysqld.exe'
$mysqladmin = Join-Path $mysqlDir 'bin\mysqladmin.exe'
$myIni = Join-Path $mysqlDir 'my.ini'
$php = Join-Path $stack 'php\php.exe'
$bd = Join-Path $stack 'srserp\SRS-Backend'
$logDir = 'C:\Users\RotemSRS_ERP\Desktop'
$launcherLog = Join-Path $logDir 'srs-launcher.log'

function Log($m) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
    Add-Content -Path $launcherLog -Value $line
}

Add-Content -Path $launcherLog -Value ""
Log "=== SRS launcher starting ==="

# Skip if already running
$mysqlRunning = @(Get-Process mysqld -EA SilentlyContinue).Count -gt 0
$phpRunning = @(Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php }).Count -gt 0

if ($mysqlRunning) {
    Log "MySQL already running - skipping mysqld start"
} else {
    Log "Starting mysqld..."
    Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$myIni" `
        -RedirectStandardOutput (Join-Path $logDir 'mysqld-out.log') `
        -RedirectStandardError (Join-Path $logDir 'mysqld-err.log') `
        -WindowStyle Hidden

    # Wait up to 60s for MySQL
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep 2
        $ping = & $mysqladmin -h 127.0.0.1 -P 3306 -u root ping 2>&1
        if ($ping -match 'alive') {
            Log "MySQL ready after $($i*2)s"
            break
        }
    }
}

if ($phpRunning) {
    Log "PHP server already running - skipping"
} else {
    Log "Starting PHP HTTP server on 0.0.0.0:8000..."
    Start-Process -FilePath $php -ArgumentList "-S","0.0.0.0:8000","-t","$bd\public" `
        -WorkingDirectory $bd `
        -RedirectStandardOutput (Join-Path $logDir 'php-server-out.log') `
        -RedirectStandardError (Join-Path $logDir 'php-server-err.log') `
        -WindowStyle Hidden
    Start-Sleep 2
}

Log "=== Launcher done ==="
Log "URL: http://localhost:8000"
Log "LAN: http://192.168.0.30:8000"
