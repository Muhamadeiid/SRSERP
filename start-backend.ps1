# SRS Backend + Cloudflare Tunnel Launcher
# Run this script every time you want the system accessible from Vercel

$BACKEND_DIR = "$PSScriptRoot\SRS-Backend"
$CLOUDFLARED  = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$PORT         = 8000

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SRS Backend Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check cloudflared ────────────────────────────────────────────────────
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "[ERROR] cloudflared not found at: $CLOUDFLARED" -ForegroundColor Red
    Write-Host "        Install with: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    exit 1
}

# ── 2. Start Laravel in a new window ───────────────────────────────────────
Write-Host "[1/2] Starting Laravel backend on port $PORT ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BACKEND_DIR'; php artisan serve --port=$PORT" -WindowStyle Normal

Start-Sleep -Seconds 3

# ── 3. Start cloudflared tunnel, capture URL ───────────────────────────────
Write-Host "[2/2] Starting Cloudflare tunnel ..." -ForegroundColor Green
Write-Host ""

$logFile = "$env:TEMP\cloudflared_output.txt"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process -FilePath $CLOUDFLARED `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:$PORT" `
    -RedirectStandardError $logFile `
    -PassThru -WindowStyle Hidden

# Wait up to 20s for the tunnel URL to appear
$tunnelUrl = $null
$waited = 0
Write-Host "   Waiting for tunnel URL" -NoNewline -ForegroundColor Yellow
while ($waited -lt 20) {
    Start-Sleep -Seconds 1
    $waited++
    Write-Host "." -NoNewline -ForegroundColor Yellow
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}
Write-Host ""

if ($tunnelUrl) {
    $apiUrl = "$tunnelUrl/api"
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   TUNNEL ACTIVE" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Backend URL  :  $tunnelUrl" -ForegroundColor White
    Write-Host "   VITE_API_URL :  $apiUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Copy the VITE_API_URL above into Vercel:" -ForegroundColor Yellow
    Write-Host "   Settings -> Environment Variables -> VITE_API_URL" -ForegroundColor Yellow
    Write-Host "   Then redeploy." -ForegroundColor Yellow
    Write-Host ""

    # Copy to clipboard automatically
    $apiUrl | Set-Clipboard
    Write-Host "   [Copied to clipboard]" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[WARN] Could not detect tunnel URL automatically." -ForegroundColor Yellow
    Write-Host "       Check the cloudflared process output manually." -ForegroundColor Yellow
    Write-Host "       Log file: $logFile" -ForegroundColor Gray
}

Write-Host "Press any key to exit this window (tunnel + backend keep running in background)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
