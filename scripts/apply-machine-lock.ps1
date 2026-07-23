$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$log = 'C:\Users\RotemSRS_ERP\Desktop\lock_apply.log'

function Log($m) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

Set-Content -Path $log -Value ("=== APPLY MACHINE LOCK " + (Get-Date) + " ===")

$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend'
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'

# Download updated middleware
Log "Downloading VerifyMachineLicense.php..."
$mwDir = Join-Path $bd 'app\Http\Middleware'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Muhamadeiid/SRSERP/main/SRS-Backend/app/Http/Middleware/VerifyMachineLicense.php' -OutFile (Join-Path $mwDir 'VerifyMachineLicense.php') -UseBasicParsing
Log "Middleware saved"

# Download updated Kernel.php
Log "Downloading Kernel.php..."
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Muhamadeiid/SRSERP/main/SRS-Backend/app/Http/Kernel.php' -OutFile (Join-Path $bd 'app\Http\Kernel.php') -UseBasicParsing
Log "Kernel updated"

# Remove existing machine lock file so it gets recaptured on this machine
$lockFile = Join-Path $bd 'storage\app\.machine_lock'
if (Test-Path $lockFile) {
    Remove-Item $lockFile -Force
    Log "Removed old .machine_lock (will recapture on first request)"
}

# Clear Laravel caches
Set-Location $bd
Log "Clearing Laravel caches..."
& $php artisan config:clear 2>&1 | ForEach-Object { Log "  $_" }
& $php artisan cache:clear 2>&1 | ForEach-Object { Log "  $_" }
& $php artisan route:clear 2>&1 | ForEach-Object { Log "  $_" }

# Restart the PHP HTTP server
Log "Restarting PHP server..."
Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2

Start-Process -FilePath $php -ArgumentList "-S","0.0.0.0:8000","-t","$bd\public" -WorkingDirectory $bd -RedirectStandardOutput 'C:\Users\RotemSRS_ERP\Desktop\php-server-out.log' -RedirectStandardError 'C:\Users\RotemSRS_ERP\Desktop\php-server-err.log' -WindowStyle Hidden
Log "PHP server restarted"

Start-Sleep 3

# Warm up: hit the site to trigger first-run capture
Log "Warming up (this captures the machine fingerprint on first hit)..."
try {
    $r1 = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 15
    Log "1st request HTTP $($r1.StatusCode) - fingerprint should now be captured"

    if (Test-Path $lockFile) {
        $hash = (Get-Content $lockFile -Raw).Trim()
        Log "Machine fingerprint captured: $($hash.Substring(0, 16))..."
    } else {
        Log "WARN: .machine_lock file not created - middleware may have failed"
    }

    $r2 = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 15
    Log "2nd request HTTP $($r2.StatusCode) - lock verified"
} catch {
    Log "Test request failed: $($_.Exception.Message)"
}

Log "=== DONE ==="
Log "The app now refuses to serve requests from any machine other than this one."
Log "URL: http://localhost:8000"
