[CmdletBinding()]
param(
    [string]$ServiceName = "HCUserManagement",
    [string]$NssmPath,
    # Default: "backups" beside the application. Point it at another disk or a
    # share for a copy that survives the loss of this server.
    [string]$BackupPath
)

# Zips the data folder into backups\hc-data-<timestamp>.zip and keeps 30 days.
#
# The service is stopped for the few seconds this takes, so the archive is one
# consistent moment, and started again whatever happens.
#
# Restore: stop the service, extract the archive over data\, start the service.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

Assert-Administrator

$appRoot = Get-AppRoot
$nssm = Resolve-Nssm -Preferred $NssmPath
$wasRunning = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status -eq "Running"

try {
    if ($wasRunning) { Stop-Portal -Nssm $nssm -ServiceName $ServiceName }
    $archive = Backup-PortalData -AppRoot $appRoot -BackupPath $BackupPath
    Write-Host "Backup dibuat: $archive"
} finally {
    if ($wasRunning) { Start-Portal -Nssm $nssm -ServiceName $ServiceName }
}

# Contoh pendaftaran harian di Task Scheduler (PowerShell sebagai Administrator).
# Berjalan sebagai SYSTEM: tidak ada password yang perlu disimpan.
#
# $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\hc-portal\deploy\windows\backup-data.ps1"'
# $trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
# Register-ScheduledTask -TaskName "HC Portal backup data" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest
