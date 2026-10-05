# Helpers shared by install-service.ps1, update-portal.ps1 and backup-data.ps1.
# They dot-source this file; running it on its own does nothing.
#
# ASCII only, on purpose: Windows PowerShell 5.1 - the version Task Scheduler
# and a default Windows Server shell run - reads a .ps1 without a BOM in the
# ANSI code page, and a UTF-8 dash or quote can become a string delimiter.

# Runs a native program and returns its exit code and output as text.
#
# Why not `& program` directly: in Windows PowerShell 5.1, once a native
# program's stderr is redirected, every line written there becomes an error
# record, and under $ErrorActionPreference = "Stop" the first one ends the
# script - even when the program exits 0. npm writes its progress to stderr,
# git writes "From ..." there, nssm writes its notices there. The preference is
# relaxed for this one call, every line is kept as text, and the caller judges
# the exit code, which is the only signal a native program gives reliably.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        # Receives each line as it arrives - for a log file or the console.
        [scriptblock]$OnLine
    )

    # Checked first: with the preference relaxed, a program that is not
    # installed would leave $LASTEXITCODE at whatever the previous one set.
    if (-not (Get-Command $FilePath -ErrorAction SilentlyContinue)) {
        throw "Perintah '$FilePath' tidak ditemukan."
    }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = @(& $FilePath @ArgumentList 2>&1 | ForEach-Object {
            $line = "$_"
            if ($OnLine) { $null = & $OnLine $line }
            $line
        })
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }

    [pscustomobject]@{ ExitCode = $code; Output = $lines }
}

# A native command that has to succeed. Throws with its last lines otherwise.
function Invoke-Required {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$What,
        [scriptblock]$OnLine
    )

    $result = Invoke-Native -FilePath $FilePath -ArgumentList $ArgumentList -OnLine $OnLine
    if ($result.ExitCode -ne 0) {
        $tail = ($result.Output | Select-Object -Last 5) -join " | "
        throw "$What gagal (kode $($result.ExitCode)): $tail"
    }
    $result
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Jalankan skrip ini dari PowerShell yang dibuka sebagai Administrator."
    }
}

# The application folder: two levels above deploy\windows.
function Get-AppRoot {
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

# node.exe: a portable copy in <app>\node first, then whatever PATH finds.
# The portable folder is put at the front of PATH as well, so npm - which
# starts node by name - runs the same version the service will.
function Use-Node {
    param([Parameter(Mandatory = $true)][string]$AppRoot)

    $portable = Join-Path $AppRoot "node\node.exe"
    if (Test-Path -LiteralPath $portable -PathType Leaf) {
        $env:PATH = (Join-Path $AppRoot "node") + ";" + $env:PATH
        return $portable
    }
    $found = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $found) {
        throw "node.exe tidak ditemukan. Pasang Node.js 22 LTS, atau ekstrak versi .zip-nya ke $AppRoot\node."
    }
    $found.Source
}

# nssm.exe: the path given, then PATH, then beside these scripts, then the
# folder the README suggests.
function Resolve-Nssm {
    param([string]$Preferred)

    $candidates = @()
    if ($Preferred) { $candidates += $Preferred }
    $onPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $candidates += (Join-Path $PSScriptRoot "nssm.exe")
    $candidates += "C:\Tools\nssm\win64\nssm.exe"

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw "nssm.exe tidak ditemukan. Unduh NSSM, lalu taruh nssm.exe di C:\Tools\nssm\win64\ atau di folder deploy\windows."
}

# Polls the login page until it answers 200, or the time runs out.
function Wait-PortalReady {
    param(
        [int]$Port = 3000,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "http://127.0.0.1:$Port/login"
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            # Not up yet.
        }
        Start-Sleep -Seconds 2
    }
    $false
}

# Zips the data folder with a timestamp and keeps 30 days of archives.
#
# The caller stops the service first, so the archive is one consistent moment
# rather than a store caught halfway through a write. Old archives are removed
# only after a new one exists, so a failed run never leaves fewer backups than
# it found.
function Backup-PortalData {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$BackupPath
    )

    if (-not $BackupPath) { $BackupPath = Join-Path $AppRoot "backups" }
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

    $data = Join-Path $AppRoot "data"
    if (-not (Test-Path -LiteralPath $data)) {
        throw "Folder data tidak ditemukan: $data"
    }

    $archive = Join-Path $BackupPath ("hc-data-{0}.zip" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    Compress-Archive -Path (Join-Path $data "*") -DestinationPath $archive -CompressionLevel Optimal

    $cutoff = (Get-Date).AddDays(-30)
    Get-ChildItem -LiteralPath $BackupPath -Filter "hc-data-*.zip" -File |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force

    $archive
}

# Stops the service and waits until Windows reports it stopped.
function Stop-Portal {
    param(
        [Parameter(Mandatory = $true)][string]$Nssm,
        [Parameter(Mandatory = $true)][string]$ServiceName
    )

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service -or $service.Status -eq "Stopped") { return }

    $null = Invoke-Native -FilePath $Nssm -ArgumentList @("stop", $ServiceName)
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Service -Name $ServiceName).Status -ne "Stopped") {
        if ((Get-Date) -ge $deadline) { throw "Service $ServiceName tidak berhenti dalam 60 detik." }
        Start-Sleep -Seconds 1
    }
}

function Start-Portal {
    param(
        [Parameter(Mandatory = $true)][string]$Nssm,
        [Parameter(Mandatory = $true)][string]$ServiceName
    )

    if ((Get-Service -Name $ServiceName).Status -eq "Running") { return }
    $null = Invoke-Required -FilePath $Nssm -ArgumentList @("start", $ServiceName) -What "Menyalakan service $ServiceName"
}
