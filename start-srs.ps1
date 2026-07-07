param(
    [string]$HostIp = "0.0.0.0",
    [int]$ApiPort = 8000,
    [int]$FrontendPort = 5175
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "SRS-Backend"
$FrontendDir = Join-Path $Root "Frontend - Copy"
$PhpExe = "C:\xampp\php\php.exe"
$MysqlStart = "C:\xampp\mysql_start.bat"
$MysqlAdmin = "C:\xampp\mysql\bin\mysqladmin.exe"
$NpmCmd = "C:\Program Files\nodejs\npm.cmd"

function Get-LanIp {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
    return "SERVER-IP"
}

Write-Host "=== SRS ERP LAN Startup ===" -ForegroundColor Cyan

Write-Host "[1/4] Starting MySQL..." -ForegroundColor Yellow
if (-not (Get-NetTCPConnection -LocalPort 3306 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$MysqlStart`"" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}
if (Test-Path $MysqlAdmin) {
    $mysqlStatus = & $MysqlAdmin -u root status 2>&1
    if ($mysqlStatus -match "Uptime") {
        Write-Host "      MySQL running." -ForegroundColor Green
    } else {
        Write-Host "      MySQL did not confirm status. Check XAMPP if login fails." -ForegroundColor Yellow
    }
}

Write-Host "[2/4] Clearing Laravel config cache..." -ForegroundColor Yellow
& $PhpExe (Join-Path $BackendDir "artisan") optimize:clear | Out-Null

Write-Host "[3/4] Starting Laravel API on port $ApiPort..." -ForegroundColor Yellow
if (-not (Get-NetTCPConnection -LocalPort $ApiPort -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $PhpExe `
        -ArgumentList "artisan", "serve", "--host=$HostIp", "--port=$ApiPort" `
        -WorkingDirectory $BackendDir `
        -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

Write-Host "[4/4] Starting Frontend on port $FrontendPort..." -ForegroundColor Yellow
if (-not (Get-NetTCPConnection -LocalPort $FrontendPort -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $NpmCmd `
        -ArgumentList "run", "dev", "--", "--host", $HostIp, "--port", $FrontendPort `
        -WorkingDirectory $FrontendDir `
        -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

$lanIp = Get-LanIp
Write-Host ""
Write-Host "=== Ready ===" -ForegroundColor Cyan
Write-Host "On this server : http://localhost:$FrontendPort/login" -ForegroundColor White
Write-Host "From LAN PCs   : http://$lanIp`:$FrontendPort/login" -ForegroundColor White
Write-Host "API            : http://$lanIp`:$ApiPort/api" -ForegroundColor White
Write-Host ""
Write-Host "If other PCs cannot open it, allow ports $ApiPort and $FrontendPort in Windows Firewall." -ForegroundColor Yellow
