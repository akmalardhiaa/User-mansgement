[CmdletBinding()]
param(
    [string]$ServiceName = "HCUserManagement",
    [string]$NssmPath,
    # node_modules was copied over with the new version - for a server that
    # cannot reach the npm registry. Skips `npm ci`.
    [switch]$SkipInstall,
    [string]$BackupPath,
    [int]$Port = 3000
)

# Brings a new version into service:
#
#   stop -> back up data -> (git pull) -> npm ci -> build -> start -> check
#
# Copying the new version in by hand is the other supported way - the office
# network may not reach the repository at all. Copy it over the application
# folder first, without overwriting .env.production.local, certs, data, logs or
# backups, then run this.
#
# A failed build does not leave the portal down: the previous .next is put
# back and the service started on it.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

Assert-Administrator

$appRoot = Get-AppRoot
$nssm = Resolve-Nssm -Preferred $NssmPath
$null = Use-Node -AppRoot $appRoot
$echo = { param($line) Write-Host "  $line" }

if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    throw "Service $ServiceName belum terpasang. Jalankan install-service.ps1 lebih dulu."
}

$next = Join-Path $appRoot ".next"
$previous = Join-Path $appRoot ".next.previous"

Push-Location $appRoot
try {
    Write-Host "1. Menghentikan portal..."
    Stop-Portal -Nssm $nssm -ServiceName $ServiceName

    Write-Host "2. Backup data..."
    Write-Host ("   " + (Backup-PortalData -AppRoot $appRoot -BackupPath $BackupPath))

    if (Test-Path -LiteralPath (Join-Path $appRoot ".git")) {
        Write-Host "3. git pull..."
        $null = Invoke-Required -FilePath "git" -ArgumentList @("pull") -What "git pull" -OnLine $echo
    } else {
        Write-Host "3. Bukan checkout git: versi baru dianggap sudah disalin ke $appRoot."
    }

    if ($SkipInstall) {
        Write-Host "4. npm ci dilewati (-SkipInstall)."
    } else {
        Write-Host "4. npm ci..."
        # --include=dev: the build needs devDependencies, even on a machine
        # where NODE_ENV=production is set system-wide.
        $null = Invoke-Required -FilePath "npm" -ArgumentList @("ci", "--include=dev") -OnLine $echo `
            -What "npm ci (bila node_modules kini tidak lengkap, salin ulang folder itu dari komputer pembangun)"
    }

    Write-Host "5. Build..."
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
    if (Test-Path -LiteralPath $next) { Rename-Item -LiteralPath $next -NewName ".next.previous" }
    $build = Invoke-Native -FilePath "npm" -ArgumentList @("run", "build") -OnLine $echo
    if ($build.ExitCode -ne 0) {
        if (Test-Path -LiteralPath $next) { Remove-Item -LiteralPath $next -Recurse -Force }
        if (Test-Path -LiteralPath $previous) { Rename-Item -LiteralPath $previous -NewName ".next" }
        throw "Build gagal (kode $($build.ExitCode)); versi sebelumnya dipulihkan dan dinyalakan kembali."
    }

    # A fresh .next does not carry the write access install-service.ps1 gave
    # the old one, and next start writes its cache there.
    $null = Invoke-Required -FilePath "icacls.exe" -What "Memberi akses tulis ke .next" -ArgumentList @(
        $next, "/grant", "NT SERVICE\${ServiceName}:(OI)(CI)M"
    )
} finally {
    # Whatever happened above, the portal does not stay off because of it.
    Pop-Location
    Write-Host "6. Menyalakan portal..."
    Start-Portal -Nssm $nssm -ServiceName $ServiceName
}

if (Wait-PortalReady -Port $Port -TimeoutSeconds 120) {
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
    Write-Host "Selesai: portal menjawab di http://127.0.0.1:$Port."
} else {
    Write-Warning "Portal belum menjawab. Lihat $appRoot\logs\service.err.log. Versi sebelumnya masih ada di .next.previous."
}
