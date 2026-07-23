$php = 'C:\Users\RotemSRS_ERP\srs_stack\php\php.exe'
$mysqlAdmin = 'C:\Users\RotemSRS_ERP\srs_stack\mysql-8.4.6-winx64\bin\mysqladmin.exe'

Write-Host "Stopping PHP HTTP server..."
Get-Process php -EA SilentlyContinue | Where-Object { $_.Path -eq $php } | Stop-Process -Force -EA SilentlyContinue

Write-Host "Requesting MySQL shutdown..."
& $mysqlAdmin -h 127.0.0.1 -P 3306 -u root shutdown 2>&1 | Out-Null
Start-Sleep 3

# Force kill if still around
Get-Process mysqld -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue

Write-Host "Stopped."
