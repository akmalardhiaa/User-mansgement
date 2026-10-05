[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $appRoot
try {
    & git pull
    if ($LASTEXITCODE -ne 0) { throw "git pull gagal dengan kode $LASTEXITCODE." }

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
    if (-not $ready) { throw "Podman belum siap setelah menunggu 120 detik." }

    & podman compose --env-file .env.production.local -f compose.production.yml build
    if ($LASTEXITCODE -ne 0) { throw "Podman image build gagal dengan kode $LASTEXITCODE." }

    & podman compose -f compose.production.yml up -d
    if ($LASTEXITCODE -ne 0) { throw "podman compose up gagal dengan kode $LASTEXITCODE." }

    & podman compose -f compose.production.yml ps
    & podman inspect --format '{{.State.Health.Status}}' hc-portal
    if ($LASTEXITCODE -ne 0) { throw "Tidak bisa membaca status health container." }
} finally {
    Pop-Location
}
