# Convenience wrapper for company LAN/offline use.
# Run from PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\start-company-lan.ps1

& "$PSScriptRoot\start-srs.ps1" -HostIp "0.0.0.0" -ApiPort 8000 -FrontendPort 5175
