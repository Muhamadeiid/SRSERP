# SRS Update Script
# Pulls latest code from GitHub, protects .env and machine lock, rebuilds if needed,
# runs any new migrations, and restarts the PHP server.

$ErrorActionPreference = 'Continue'
$log = "$env:USERPROFILE\Desktop\srs-update.log"

function Log($m) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

Add-Content -Path $log -Value ""
Log "=== SRS UPDATE STARTED ==="

$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp'
$backend = Join-Path $bd 'SRS-Backend'
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
$composer = 'C:\Users\RotemSRS_ERP\srs_stack\composer.phar'

Set-Location $bd

# Backup .env and machine_lock in case git does something surprising
$snapEnv = "$env:TEMP\srs.env.snap"
$snapLock = "$env:TEMP\srs.machine_lock.snap"
Copy-Item "$backend\.env" $snapEnv -Force -EA SilentlyContinue
Copy-Item "$backend\storage\app\.machine_lock" $snapLock -Force -EA SilentlyContinue
Log "Snapped .env and machine_lock"

# Fetch and figure out if there is anything new
Log "Fetching from origin..."
git fetch origin main 2>&1 | ForEach-Object { Log "  $_" }

$local = (git rev-parse HEAD).Trim()
$remote = (git rev-parse origin/main).Trim()
if ($local -eq $remote) {
    Log "Already up to date ($local). Nothing to do."
    Log "=== DONE ==="
    exit 0
}

Log "Local:  $local"
Log "Remote: $remote"
Log "Updating..."

# Hard reset — assumes no local edits worth keeping outside .env / machine_lock
git reset --hard origin/main 2>&1 | ForEach-Object { Log "  $_" }

# Restore protected files
Copy-Item $snapEnv "$backend\.env" -Force -EA SilentlyContinue
Copy-Item $snapLock "$backend\storage\app\.machine_lock" -Force -EA SilentlyContinue
Log ".env and machine_lock restored"

# What changed?
$changed = git diff --name-only "$local..HEAD" 2>&1
$composerNeeded = $changed -match 'composer\.(json|lock)|SRS-Backend/app/|SRS-Backend/routes/|SRS-Backend/config/'
$migrationsNeeded = $changed -match 'SRS-Backend/database/migrations/'
$frontendNeeded = $changed -match 'Frontend - Copy/'

if ($composerNeeded) {
    Log "Backend files changed - reinstalling composer packages..."
    Set-Location $backend
    & $php $composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | Select-Object -Last 5 | ForEach-Object { Log "  $_" }
    Set-Location $bd
}

if ($migrationsNeeded) {
    Log "Migrations changed - running artisan migrate..."
    Set-Location $backend
    & $php artisan migrate --force 2>&1 | ForEach-Object { Log "  $_" }
    Set-Location $bd
}

if ($frontendNeeded) {
    Log "Frontend source changed - downloading pre-built dist from Release..."
    $zip = "$env:TEMP\srs-public.zip"
    $tmp = "$env:TEMP\srs-public-tmp"
    try {
        Invoke-WebRequest -Uri 'https://github.com/Muhamadeiid/SRSERP/releases/latest/download/public-only.zip' -OutFile $zip -UseBasicParsing
        Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
        Expand-Archive $zip -DestinationPath $tmp -Force
        Remove-Item (Join-Path $backend 'public\assets') -Recurse -Force -EA SilentlyContinue
        Copy-Item (Join-Path $tmp 'public\*') (Join-Path $backend 'public') -Recurse -Force
        Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
        Log "Frontend replaced from Release"
    } catch {
        Log "Could not fetch frontend Release: $($_.Exception.Message)"
    }
}

# Always clear Laravel caches so config/route changes take effect
Set-Location $backend
Log "Clearing Laravel caches..."
& $php artisan config:clear 2>&1 | ForEach-Object { Log "  $_" }
& $php artisan route:clear 2>&1 | ForEach-Object { Log "  $_" }
& $php artisan cache:clear 2>&1 | ForEach-Object { Log "  $_" }

# Restart the PHP HTTP server
Log "Restarting PHP server..."
Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2
$phpErrorLog = "$env:USERPROFILE\Desktop\php-error.log"
Start-Process -FilePath $php `
    -ArgumentList "-d","display_errors=0","-d","display_startup_errors=0","-d","log_errors=1","-d","error_log=$phpErrorLog","-S","0.0.0.0:8000","-t","$backend\public" `
    -WorkingDirectory $backend `
    -RedirectStandardOutput "$env:USERPROFILE\Desktop\php-server-out.log" `
    -RedirectStandardError "$env:USERPROFILE\Desktop\php-server-err.log" `
    -WindowStyle Hidden
Start-Sleep 3

# Sanity check
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 10
    Log "Site responded HTTP $($r.StatusCode) - update complete."
} catch {
    Log "WARNING: site did not respond after restart: $($_.Exception.Message)"
}

Log "=== UPDATE DONE ==="
Log "URL: http://192.168.0.30:8000"
