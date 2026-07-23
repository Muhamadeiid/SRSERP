$ErrorActionPreference = 'Stop'
$log = 'C:\Users\RotemSRS_ERP\Desktop\spa_fix.log'
Set-Content -Path $log -Value ("=== SPA FIX " + (Get-Date) + " ===")

$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend'
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'

# Update routes/web.php
Add-Content -Path $log -Value "Downloading updated web.php..."
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Muhamadeiid/SRSERP/main/SRS-Backend/routes/web.php' -OutFile (Join-Path $bd 'routes\web.php') -UseBasicParsing
Add-Content -Path $log -Value "web.php updated"

# Clear Laravel caches
Set-Location $bd
Add-Content -Path $log -Value "Clearing caches..."
& $php artisan config:clear 2>&1 | Add-Content -Path $log
& $php artisan route:clear 2>&1 | Add-Content -Path $log
& $php artisan cache:clear 2>&1 | Add-Content -Path $log
& $php artisan view:clear 2>&1 | Add-Content -Path $log

# Restart PHP HTTP server
Add-Content -Path $log -Value "Restarting PHP server..."
Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2
Start-Process -FilePath $php -ArgumentList "-S","0.0.0.0:8000","-t","$bd\public" -WorkingDirectory $bd -RedirectStandardOutput 'C:\Users\RotemSRS_ERP\Desktop\php-server-out.log' -RedirectStandardError 'C:\Users\RotemSRS_ERP\Desktop\php-server-err.log' -WindowStyle Hidden
Start-Sleep 3

# Test
Add-Content -Path $log -Value "Testing..."
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 10
    Add-Content -Path $log -Value ("HTTP " + $r.StatusCode + " - " + $r.Content.Length + " bytes")
    if ($r.Content -match 'Laravel') {
        Add-Content -Path $log -Value "STILL SHOWING LARAVEL WELCOME - route not applied"
    } elseif ($r.Content -match 'root|srs|SRS') {
        Add-Content -Path $log -Value "SUCCESS - React SPA is now being served"
    }
} catch {
    Add-Content -Path $log -Value ("Test failed: " + $_.Exception.Message)
}

Add-Content -Path $log -Value "=== DONE ==="
Add-Content -Path $log -Value "Refresh http://localhost:8000 in your browser"
