[CmdletBinding()]
param(
    # A production image saved on another machine with `podman save`, for a
    # server that cannot reach the npm registry to build one. Loaded instead
    # of building; see "Tanpa git atau tanpa akses npm" in README.md.
    [string]$ImageArchive
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "podman-common.ps1")

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$echo = { param($line) Write-Host $line }

if ($ImageArchive -and -not (Test-Path -LiteralPath $ImageArchive)) {
    throw "Arsip image '$ImageArchive' tidak ditemukan."
}

Push-Location $appRoot
try {
    # git only when this folder is a git checkout. Copying the new version in
    # by hand is the other supported way - the office network may not reach
    # the repository at all - and then there is nothing to pull.
    if (Test-Path -LiteralPath (Join-Path $appRoot ".git")) {
        $pull = Invoke-Native -FilePath "git" -ArgumentList @("pull") -OnLine $echo
        if ($pull.ExitCode -ne 0) { throw "git pull gagal dengan kode $($pull.ExitCode)." }
    } else {
        Write-Host "Bukan checkout git: versi baru dianggap sudah disalin ke $appRoot."
    }

    Wait-PodmanReady -OnLine $echo

    if ($ImageArchive) {
        $null = Invoke-Podman -ArgumentList @("load", "-i", $ImageArchive) -What "podman load" -OnLine $echo
    } else {
        $null = Invoke-Podman `
            -ArgumentList @("compose", "--env-file", ".env.production.local", "-f", "compose.production.yml", "build") `
            -What "Build image production" -OnLine $echo
    }

    $null = Invoke-Podman -ArgumentList @("compose", "-f", "compose.production.yml", "up", "-d") `
        -What "podman compose up" -OnLine $echo
    $null = Invoke-Podman -ArgumentList @("compose", "-f", "compose.production.yml", "ps") `
        -What "podman compose ps" -OnLine $echo

    $health = Invoke-Podman -ArgumentList @("inspect", "--format", "{{.State.Health.Status}}", "hc-portal") `
        -What "Membaca status health container"
    Write-Host "Status health hc-portal: $($health.Output -join ' ')"
} finally {
    Pop-Location
}
