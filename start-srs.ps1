Write-Host "=== SRS ERP Startup ===" -ForegroundColor Cyan

# 1. Start MySQL
Write-Host "`n[1/4] Starting MySQL..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/c C:\xampp\mysql_start.bat" -WindowStyle Hidden
Start-Sleep -Seconds 4
$mysqlStatus = & "C:\xampp\mysql\bin\mysqladmin.exe" -u root status 2>&1
if ($mysqlStatus -match "Uptime") {
    Write-Host "      MySQL is running." -ForegroundColor Green
} else {
    Write-Host "      MySQL failed to start!" -ForegroundColor Red; exit 1
}

# 2. Start Laravel
Write-Host "[2/4] Starting Laravel backend..." -ForegroundColor Yellow
$laravelRunning = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue)
if (-not $laravelRunning) {
    Start-Process -FilePath "php" -ArgumentList "artisan","serve","--host=0.0.0.0","--port=8000" `
        -WorkingDirectory "C:\Users\elash\srserp\SRS-Backend" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}
Write-Host "      Laravel running on port 8000." -ForegroundColor Green

# 3. Start Cloudflare Tunnel and capture URL
Write-Host "[3/4] Starting Cloudflare Tunnel..." -ForegroundColor Yellow
$logFile = "C:\xampp\tunnel-err.log"
Remove-Item $logFile -ErrorAction SilentlyContinue
Start-Process -FilePath "C:\xampp\cloudflared.exe" `
    -ArgumentList "tunnel","--url","http://localhost:8000" `
    -RedirectStandardError $logFile -WindowStyle Hidden

# Wait for URL to appear
$tunnelUrl = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "      Could not get tunnel URL!" -ForegroundColor Red; exit 1
}
Write-Host "      Tunnel URL: $tunnelUrl" -ForegroundColor Green

# 4. Update Vercel env vars and redeploy
Write-Host "[4/4] Updating Vercel and redeploying..." -ForegroundColor Yellow
$apiUrl = "$tunnelUrl/api"

Set-Location "C:\Users\elash\srserp\Frontend - Copy"

vercel env rm VITE_API_URL production --yes 2>&1 | Out-Null
vercel env rm VITE_API_BASE production --yes 2>&1 | Out-Null
vercel env add VITE_API_URL production --value $apiUrl --yes 2>&1 | Out-Null
vercel env add VITE_API_BASE production --value $apiUrl --yes 2>&1 | Out-Null
vercel --prod --yes 2>&1 | Out-Null

Write-Host "      Vercel updated and redeployed." -ForegroundColor Green

Write-Host "`n=== All done! ===" -ForegroundColor Cyan
Write-Host "Site: https://srs-erp-delta.vercel.app" -ForegroundColor White
Write-Host "API:  $apiUrl" -ForegroundColor White
Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
