[CmdletBinding()]
param(
    [string]$DataPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "data"),
    [string]$BackupPath = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "backups")
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $DataPath -PathType Container)) {
    throw "Folder data tidak ditemukan: $DataPath."
}

New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $BackupPath "hc-data-$timestamp.zip"
Compress-Archive -LiteralPath $DataPath -DestinationPath $archive -CompressionLevel Optimal

$cutoff = (Get-Date).AddDays(-30)
Get-ChildItem -LiteralPath $BackupPath -Filter "hc-data-*.zip" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force

Write-Host "Backup dibuat: $archive"

# Contoh pendaftaran harian Task Scheduler (jalankan sebagai Administrator):
# $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\HC\UserManagement\deploy\windows\backup-data.ps1"'
# $trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
# Register-ScheduledTask -TaskName "HC User Management data backup" -Action $action -Trigger $trigger -RunLevel Highest -User "DOMAIN\svc-hc-portal"
