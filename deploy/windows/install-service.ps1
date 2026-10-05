[CmdletBinding()]
param(
    [string]$ServiceName = "HCUserManagement",
    [string]$NssmPath = "C:\Tools\nssm\win64\nssm.exe"
)

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Jalankan skrip ini dari PowerShell yang dibuka sebagai Administrator."
}

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$buildId = Join-Path $appRoot ".next\BUILD_ID"
$envFile = Join-Path $appRoot ".env.production.local"
if (-not (Test-Path -LiteralPath $buildId -PathType Leaf)) {
    throw "Build Next.js tidak ditemukan: $buildId. Jalankan npm run build."
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Environment production tidak ditemukan: $envFile."
}
if (-not (Test-Path -LiteralPath $NssmPath -PathType Leaf)) {
    throw "NSSM tidak ditemukan: $NssmPath."
}

$serviceAccount = Read-Host "Akun service (contoh DOMAIN\svc-hc-portal)"
if ([string]::IsNullOrWhiteSpace($serviceAccount)) {
    throw "Akun service wajib diisi."
}

function Invoke-Nssm {
    param([string[]]$Arguments)
    & $NssmPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Perintah NSSM gagal: nssm $($Arguments[0]) $($Arguments[1])."
    }
}

$dataRoot = Join-Path $appRoot "data"
$certRoot = Join-Path $appRoot "certs"
$logRoot = Join-Path $appRoot "logs"
foreach ($directory in @($dataRoot, $certRoot, $logRoot)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    & icacls.exe $directory /inheritance:r /grant:r `
        ("{0}:(OI)(CI)M" -f $serviceAccount) `
        "Administrators:(OI)(CI)F" `
        "SYSTEM:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal membatasi ACL NTFS pada $directory."
    }
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$nextCli = Join-Path $appRoot "node_modules\next\dist\bin\next"
$stdoutLog = Join-Path $logRoot "service.out.log"
$stderrLog = Join-Path $logRoot "service.err.log"

Invoke-Nssm @("install", $ServiceName, $node)
Invoke-Nssm @("set", $ServiceName, "AppDirectory", $appRoot)
Invoke-Nssm @("set", $ServiceName, "AppParameters", "$nextCli start -H 127.0.0.1 -p 3000")
Invoke-Nssm @("set", $ServiceName, "AppEnvironmentExtra", "NODE_ENV=production")
Invoke-Nssm @("set", $ServiceName, "AppStdout", $stdoutLog)
Invoke-Nssm @("set", $ServiceName, "AppStderr", $stderrLog)
Invoke-Nssm @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm @("set", $ServiceName, "AppRotateOnline", "1")
Invoke-Nssm @("set", $ServiceName, "AppRotateBytes", "10485760")
Invoke-Nssm @("set", $ServiceName, "AppExit", "Default", "Restart")
Invoke-Nssm @("set", $ServiceName, "AppRestartDelay", "5000")
Invoke-Nssm @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
Invoke-Nssm @("set", $ServiceName, "ObjectName", $serviceAccount)
Invoke-Nssm @("start", $ServiceName)
Write-Host "Service $ServiceName sudah terpasang dan dimulai."
