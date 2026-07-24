$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$log = 'C:\Users\RotemSRS_ERP\Desktop\fe_fix.log'
Set-Content -Path $log -Value ("=== FE FIX " + (Get-Date) + " ===")

$bd = 'C:\Users\RotemSRS_ERP\srs_stack\srserp\SRS-Backend'
$pubDir = Join-Path $bd 'public'
$zipPath = 'C:\Users\RotemSRS_ERP\srs_stack\public-only.zip'
$tmpDir = 'C:\Users\RotemSRS_ERP\srs_stack\public-tmp'

Add-Content -Path $log -Value "Downloading rebuilt frontend..."
Invoke-WebRequest -Uri 'https://github.com/Muhamadeiid/SRSERP/releases/download/v-deploy-2026-07-23/public-only.zip' -OutFile $zipPath -UseBasicParsing
Add-Content -Path $log -Value ("Downloaded " + (Get-Item $zipPath).Length + " bytes")

Remove-Item $tmpDir -Recurse -Force -EA SilentlyContinue
Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
Add-Content -Path $log -Value "Extracted"

# Wipe old assets in public/, then copy the new dist over
Remove-Item (Join-Path $pubDir 'assets') -Recurse -Force -EA SilentlyContinue
Copy-Item (Join-Path $tmpDir 'public\*') $pubDir -Recurse -Force
Add-Content -Path $log -Value "Frontend files replaced"

# Clean up
Remove-Item $tmpDir -Recurse -Force -EA SilentlyContinue

# Restart PHP server so it picks up the new files (safer for opcache)
$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep 2
Start-Process -FilePath $php -ArgumentList "-S","0.0.0.0:8000","-t","$bd\public" -WorkingDirectory $bd -RedirectStandardOutput 'C:\Users\RotemSRS_ERP\Desktop\php-server-out.log' -RedirectStandardError 'C:\Users\RotemSRS_ERP\Desktop\php-server-err.log' -WindowStyle Hidden
Add-Content -Path $log -Value "PHP server restarted"

Start-Sleep 3

# Sanity-check the served bundle for the correct baseURL
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000' -UseBasicParsing -TimeoutSec 10
    Add-Content -Path $log -Value ("Landing HTTP " + $r.StatusCode + " - " + $r.Content.Length + " bytes")
    if ($r.Content -match 'C:/Program Files') {
        Add-Content -Path $log -Value "STILL SEEING C:/Program Files in HTML - cache?"
    }
} catch {
    Add-Content -Path $log -Value ("Test failed: " + $_.Exception.Message)
}

Add-Content -Path $log -Value "=== DONE ==="
Add-Content -Path $log -Value "Hard-refresh the browser (Ctrl+F5) to pick up the new bundle"
