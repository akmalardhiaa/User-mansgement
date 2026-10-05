[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logRoot = "C:\hc-portal\logs"
$logFile = Join-Path $logRoot "start-portal.log"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-PortalLog {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logFile -Value $line
    Write-Host $line
}

Push-Location $appRoot
try {
    Write-PortalLog "Memulai Podman machine (jika belum berjalan)."
    & podman machine start 2>&1 | ForEach-Object { Write-PortalLog "$_" }
    if ($LASTEXITCODE -ne 0) {
        Write-PortalLog "podman machine start mengembalikan kode $LASTEXITCODE; memeriksa kesiapan machine yang mungkin sudah aktif."
    }

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

    Write-PortalLog "Menjalankan compose production."
    & podman compose -f compose.production.yml up -d 2>&1 |
        ForEach-Object { Write-PortalLog "$_" }
    if ($LASTEXITCODE -ne 0) {
        throw "podman compose up gagal dengan kode $LASTEXITCODE."
    }
    Write-PortalLog "Portal diminta berjalan."
} catch {
    Write-PortalLog "GAGAL: $($_.Exception.Message)"
    throw
} finally {
    Pop-Location
}
