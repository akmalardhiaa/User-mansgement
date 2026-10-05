[CmdletBinding()]
param(
    [string]$ServiceName = "HCUserManagement",
    # Found on its own when left out; see Resolve-Nssm in common.ps1.
    [string]$NssmPath,
    [int]$Port = 3000
)

# Installs the portal as a Windows service: node running `next start`,
# supervised by NSSM, starting at boot without anybody logged in.
#
# Run again at any time: an existing service is stopped and reconfigured
# rather than installed twice.
#
# The service runs as its own virtual account, NT SERVICE\<ServiceName>. No
# password exists for it anywhere - not in this script, not in NSSM, not on a
# command line. It needs none: the portal reaches Active Directory with
# AD_BIND_DN/AD_BIND_PASSWORD and the mail relay with SMTP_* from
# .env.production.local, never with the identity of the Windows process.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

Assert-Administrator

$appRoot = Get-AppRoot
$envFile = Join-Path $appRoot ".env.production.local"

if (-not (Test-Path -LiteralPath (Join-Path $appRoot ".next\BUILD_ID") -PathType Leaf)) {
    throw "Build belum ada. Jalankan dulu: npm ci lalu npm run build (lihat README.md langkah 4)."
}
if (-not (Test-Path -LiteralPath (Join-Path $appRoot "node_modules\next") -PathType Container)) {
    throw "node_modules belum ada. Jalankan dulu: npm ci."
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Konfigurasi production belum ada: $envFile. Salin dari deploy\windows\env.production.example."
}
# Next reads .env.local in production as well. One copied over from a laptop
# would quietly supply whatever .env.production.local leaves out - a Gmail
# password, a localhost APP_BASE_URL - so it is refused rather than tolerated.
foreach ($stray in @(".env.local", ".env.development.local")) {
    if (Test-Path -LiteralPath (Join-Path $appRoot $stray)) {
        throw "Hapus $stray dari folder server ini. Mode production ikut membacanya, jadi isinya bisa tercampur ke konfigurasi production."
    }
}

$node = Use-Node -AppRoot $appRoot
$nssm = Resolve-Nssm -Preferred $NssmPath
$account = "NT SERVICE\$ServiceName"
$logRoot = Join-Path $appRoot "logs"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Service $ServiceName sudah ada: dihentikan lalu dikonfigurasi ulang."
    Stop-Portal -Nssm $nssm -ServiceName $ServiceName
} else {
    $null = Invoke-Required -FilePath $nssm -ArgumentList @("install", $ServiceName, $node) -What "Membuat service"
}

# Relative to AppDirectory, on purpose. An absolute path would need quotes
# when the folder has a space in it, and Windows PowerShell 5.1 drops quotes
# embedded in an argument to a native program - nssm would receive the path
# split at the space, and the service would fail to start.
$parameters = "node_modules\next\dist\bin\next start -H 127.0.0.1 -p $Port"
$settings = @(
    @("Application", $node),
    @("AppDirectory", $appRoot),
    @("AppParameters", $parameters),
    @("AppEnvironmentExtra", "NODE_ENV=production"),
    @("DisplayName", "HC User Management"),
    @("Description", "Portal HC User Management (Next.js). Hanya boleh satu instance."),
    @("Start", "SERVICE_AUTO_START"),
    @("AppStdout", (Join-Path $logRoot "service.out.log")),
    @("AppStderr", (Join-Path $logRoot "service.err.log")),
    @("AppRotateFiles", "1"),
    @("AppRotateOnline", "1"),
    @("AppRotateBytes", "10485760"),
    @("AppExit", "Default", "Restart"),
    @("AppRestartDelay", "5000")
)
foreach ($setting in $settings) {
    $null = Invoke-Required -FilePath $nssm -ArgumentList (@("set", $ServiceName) + $setting) -What "nssm set $($setting[0])"
}

# The virtual account. sc.exe takes no password for it, because there is none.
$null = Invoke-Required -FilePath "sc.exe" -ArgumentList @("config", $ServiceName, "obj=", $account) -What "Mengatur akun service"

# NTFS permissions, by SID for the built-in groups so a non-English Windows
# resolves them the same way: S-1-5-32-544 Administrators, S-1-5-18 SYSTEM.
$admins = "*S-1-5-32-544"
$system = "*S-1-5-18"

function Set-PrivateAcl {
    param([string]$Path, [string]$Grant)
    $null = Invoke-Required -FilePath "icacls.exe" -What "Membatasi akses $Path" -ArgumentList @(
        $Path, "/inheritance:r", "/grant:r", $Grant, "${admins}:(OI)(CI)F", "${system}:(OI)(CI)F"
    )
}

# Read and run the application.
$null = Invoke-Required -FilePath "icacls.exe" -What "Memberi akses baca ke folder aplikasi" -ArgumentList @(
    $appRoot, "/grant", "${account}:(OI)(CI)RX"
)

# Written by the service: the store, sessions and outbox; the logs; Next's
# runtime cache. data\ and logs\ also hold what nobody else should read.
$data = Join-Path $appRoot "data"
New-Item -ItemType Directory -Path $data -Force | Out-Null
Set-PrivateAcl -Path $data -Grant "${account}:(OI)(CI)M"
Set-PrivateAcl -Path $logRoot -Grant "${account}:(OI)(CI)M"
$null = Invoke-Required -FilePath "icacls.exe" -What "Memberi akses tulis ke .next" -ArgumentList @(
    (Join-Path $appRoot ".next"), "/grant", "${account}:(OI)(CI)M"
)

# Read only, and only by the service: the CA and every secret the portal has.
$certs = Join-Path $appRoot "certs"
New-Item -ItemType Directory -Path $certs -Force | Out-Null
Set-PrivateAcl -Path $certs -Grant "${account}:(OI)(CI)RX"
$null = Invoke-Required -FilePath "icacls.exe" -What "Membatasi akses .env.production.local" -ArgumentList @(
    $envFile, "/inheritance:r", "/grant:r", "${account}:R", "${admins}:F", "${system}:F"
)

# The per-employee folders, when they are a local path. A share (\\server\...)
# is reached as this computer's account, and is granted on the share itself.
$folderLine = Select-String -LiteralPath $envFile -Pattern "^\s*USER_FOLDER_ROOT\s*=\s*(.+?)\s*$" | Select-Object -First 1
if ($folderLine) {
    $folderRoot = $folderLine.Matches[0].Groups[1].Value.Trim('"')
    if ($folderRoot.StartsWith("\\")) {
        Write-Host "USER_FOLDER_ROOT adalah share ($folderRoot): beri akun komputer server ini hak Modify di share tersebut."
    } elseif ($folderRoot) {
        if (-not [IO.Path]::IsPathRooted($folderRoot)) { $folderRoot = Join-Path $appRoot $folderRoot }
        New-Item -ItemType Directory -Path $folderRoot -Force | Out-Null
        $null = Invoke-Required -FilePath "icacls.exe" -What "Memberi akses tulis ke $folderRoot" -ArgumentList @(
            $folderRoot, "/grant", "${account}:(OI)(CI)M"
        )
    }
}

Start-Portal -Nssm $nssm -ServiceName $ServiceName
Write-Host "Menunggu portal menjawab di http://127.0.0.1:$Port ..."
if (Wait-PortalReady -Port $Port -TimeoutSeconds 120) {
    Write-Host "Service $ServiceName berjalan sebagai $account."
} else {
    Write-Warning "Service menyala tetapi portal belum menjawab. Lihat $logRoot\service.err.log."
}
