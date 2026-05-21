Write-Host "=== SRS ERP Startup ===" -ForegroundColor Cyan
Write-Host "    Backend: http://localhost:8000" -ForegroundColor Gray
Write-Host "    Frontend: http://localhost:5173" -ForegroundColor Gray
Write-Host ""

# 1. Start MySQL
Write-Host "[1/3] Starting MySQL..." -ForegroundColor Yellow
$mysqlRunning = (Get-NetTCPConnection -LocalPort 3306 -ErrorAction SilentlyContinue)
if (-not $mysqlRunning) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c C:\xampp\mysql_start.bat" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}
$mysqlStatus = & "C:\xampp\mysql\bin\mysqladmin.exe" -u root status 2>&1
if ($mysqlStatus -match "Uptime") {
    Write-Host "      MySQL running." -ForegroundColor Green
} else {
    Write-Host "      MySQL may not be running -- continuing anyway." -ForegroundColor Yellow
}

# 2. Start Laravel backend
Write-Host "[2/3] Starting Laravel backend on port 8000..." -ForegroundColor Yellow
$laravelRunning = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue)
if (-not $laravelRunning) {
    Start-Process -FilePath "C:\xampp\php\php.exe" `
        -ArgumentList "artisan", "serve", "--host=0.0.0.0", "--port=8000" `
        -WorkingDirectory "C:\Users\elash\srserp\SRS-Backend" `
        -WindowStyle Hidden
    Start-Sleep -Seconds 3
}
Write-Host "      Laravel running on port 8000." -ForegroundColor Green

# 3. Start Frontend dev server
Write-Host "[3/3] Starting Frontend dev server on port 5173..." -ForegroundColor Yellow
$frontendRunning = (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue)
if (-not $frontendRunning) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm run dev" `
        -WorkingDirectory "C:\Users\elash\srserp\Frontend - Copy" `
        -WindowStyle Normal
    Start-Sleep -Seconds 3
}
Write-Host "      Frontend starting on port 5173." -ForegroundColor Green

Write-Host ""
Write-Host "=== All done! ===" -ForegroundColor Cyan
Write-Host "Site : http://localhost:5173" -ForegroundColor White
Write-Host "API  : http://localhost:8000/api" -ForegroundColor White
Write-Host ""
