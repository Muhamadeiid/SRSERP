# SRS Update Script
# Pulls latest code from GitHub, protects .env and machine lock, rebuilds if needed,
# runs any new migrations, and restarts the PHP server.

param(
    [switch]$RefreshFrontend
)

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
$frontend = Join-Path $bd 'Frontend - Copy'
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
$composer = 'C:\Users\RotemSRS_ERP\srs_stack\composer.phar'
$nodeDir = 'C:\Users\RotemSRS_ERP\srs_stack\node_msi\PFiles64\nodejs'
$scriptHashBefore = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash

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
$forceFrontendRefresh = $RefreshFrontend.IsPresent
if ($local -eq $remote) {
    Log "Source is already up to date ($local)."
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

# Always prefer the updater tracked inside the repository. The Desktop copy can
# become stale because git pull does not replace files outside the repository.
$repoUpdateScript = Join-Path $bd 'scripts\srs-update.ps1'
$repoScriptHash = if (Test-Path $repoUpdateScript) {
    (Get-FileHash -LiteralPath $repoUpdateScript -Algorithm SHA256).Hash
} else {
    ''
}
if ($repoScriptHash -and ($PSCommandPath -ne $repoUpdateScript -or $scriptHashBefore -ne $repoScriptHash)) {
    Log "Switching to the latest updater from the repository..."
    $restartArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $repoUpdateScript)
    if ($RefreshFrontend.IsPresent) {
        $restartArgs += '-RefreshFrontend'
    }
    & powershell.exe @restartArgs
    exit $LASTEXITCODE
}

# What changed?
$changed = git diff --name-only "$local..HEAD" 2>&1
$composerNeeded = $changed -match 'composer\.(json|lock)|SRS-Backend/app/|SRS-Backend/routes/|SRS-Backend/config/'
$migrationsNeeded = $forceFrontendRefresh -or ($changed -match 'SRS-Backend/database/migrations/')

# Track what was actually deployed, independently from the Git working tree.
# The source tree hash changes only when Frontend - Copy changes. The deployed
# index hash also detects an old public folder copied manually over the site.
$deployedMarker = Join-Path $backend 'storage\app\.last_deployed_frontend'
$deployedIndexMarker = Join-Path $backend 'storage\app\.last_deployed_frontend_index'
$publicIndex = Join-Path $backend 'public\index.html'
$currentFrontendTree = (git rev-parse 'HEAD:Frontend - Copy').Trim()
$deployedFrontendTree = if (Test-Path $deployedMarker) {
    (Get-Content $deployedMarker -Raw).Trim()
} else {
    ''
}
$expectedIndexHash = if (Test-Path $deployedIndexMarker) {
    (Get-Content $deployedIndexMarker -Raw).Trim()
} else {
    ''
}
$actualIndexHash = if (Test-Path $publicIndex) {
    (Get-FileHash -LiteralPath $publicIndex -Algorithm SHA256).Hash
} else {
    ''
}
$frontendNeeded = $forceFrontendRefresh `
    -or ($deployedFrontendTree -ne $currentFrontendTree) `
    -or ($expectedIndexHash -eq '') `
    -or ($actualIndexHash -ne $expectedIndexHash)

if ($frontendNeeded) {
    Log "Frontend deployment is stale or unverified - deployment required."
} else {
    Log "Frontend deployment matches source tree $currentFrontendTree."
}

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
    $npm = Join-Path $nodeDir 'npm.cmd'
    $dist = Join-Path $frontend 'dist'
    $frontendBuilt = $false
    $frontendDeployed = $false

    if (Test-Path $npm) {
        Log "Frontend source changed - building latest source..."
        $env:PATH = "$nodeDir;$env:PATH"
        Set-Location $frontend
        Log "Synchronizing frontend packages..."
        & $npm install --no-audit --no-fund 2>&1 | Select-Object -Last 10 | ForEach-Object { Log "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Log "ERROR: npm install failed; frontend build will not run."
        } else {
            $env:VITE_API_URL = '/api'
            $env:VITE_API_BASE = '/api'
            & $npm run build 2>&1 | Select-Object -Last 15 | ForEach-Object { Log "  $_" }
            $frontendBuilt = ($LASTEXITCODE -eq 0) -and (Test-Path (Join-Path $dist 'index.html'))
        }
        Set-Location $bd
    }

    if ($frontendBuilt) {
        Remove-Item (Join-Path $backend 'public\assets') -Recurse -Force -EA SilentlyContinue
        Remove-Item (Join-Path $backend 'public\train-loader.png') -Force -EA SilentlyContinue
        Copy-Item (Join-Path $dist '*') (Join-Path $backend 'public') -Recurse -Force
        $frontendDeployed = $true
        Log "Frontend built and deployed from latest source"
    } else {
        Log "ERROR: Frontend build failed. The current deployed frontend was preserved."
        Log "Fix Node/npm or the build error, then run this updater again."
    }

    if ($frontendDeployed -and (Test-Path $publicIndex)) {
        $deployedIndexHash = (Get-FileHash -LiteralPath $publicIndex -Algorithm SHA256).Hash
        Set-Content -Path $deployedMarker -Value $currentFrontendTree -Encoding ASCII
        Set-Content -Path $deployedIndexMarker -Value $deployedIndexHash -Encoding ASCII
        Log "Deployed frontend recorded: tree=$currentFrontendTree index=$deployedIndexHash"
    }
}

# Rebuild Laravel's production caches after every update. This only writes
# generated files under bootstrap/cache; it does not modify application data.
Set-Location $backend
Log "Rebuilding Laravel production caches..."
& $php artisan optimize:clear 2>&1 | ForEach-Object { Log "  $_" }
& $php artisan optimize 2>&1 | ForEach-Object { Log "  $_" }

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
