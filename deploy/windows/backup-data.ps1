[CmdletBinding()]
param(
    [string]$BackupPath = "C:\hc-portal\backups"
)

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

& podman machine start 2>&1 | Out-Null
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & podman info *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    throw "Podman belum siap setelah menunggu 120 detik."
}

Push-Location $appRoot
$stopped = $false
try {
    & podman compose -f compose.production.yml stop portal
    if ($LASTEXITCODE -ne 0) { throw "Gagal menghentikan portal untuk membuat backup konsisten." }
    $stopped = $true

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $archive = Join-Path $BackupPath "hc-data-$timestamp.tar"
    & podman volume export hc-data --output $archive
    if ($LASTEXITCODE -ne 0) { throw "podman volume export gagal." }

    $cutoff = (Get-Date).AddDays(-30)
    Get-ChildItem -LiteralPath $BackupPath -Filter "hc-data-*.tar" -File |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force
    Write-Host "Backup volume hc-data dibuat: $archive"
} finally {
    if ($stopped) {
        & podman compose -f compose.production.yml up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Backup selesai tetapi portal gagal dimulai kembali. Jalankan start-portal.ps1."
        }
    }
    Pop-Location
}

# Contoh pendaftaran harian Task Scheduler (jalankan sebagai Administrator):
# $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\hc-portal\deploy\windows\backup-data.ps1"'
# $trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
# $credential = Get-Credential -UserName "DOMAIN\akun-pemilik-podman"
# Register-ScheduledTask -TaskName "HC Portal data backup" -Action $action -Trigger $trigger -RunLevel Highest -User $credential.UserName -Password $credential.GetNetworkCredential().Password
