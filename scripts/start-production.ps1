[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$state = Join-Path $root 'state'
$pidPath = Join-Path $state 'runtime.pid'
$stdout = Join-Path $state 'runtime.out.log'
$stderr = Join-Path $state 'runtime.err.log'
$userProfile = [Environment]::GetFolderPath('UserProfile')
$node = Join-Path $userProfile '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$healthUrl = 'http://127.0.0.1:4782/api/status'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'mahoraga.manifest.json') | ConvertFrom-Json
$expectedVersion = [string]$manifest.version
$expectedControlCenterVersion = [string]$manifest.versions.controlCenter

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    throw 'The pinned Node.js runtime is unavailable.'
}

New-Item -ItemType Directory -Path $state -Force | Out-Null

$existing = $null
try {
    $existing = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
} catch {}
if ($existing -and $existing.product -eq 'Mahoraga') {
    if ([string]$existing.version -eq $expectedVersion -and [string]$existing.versions.controlCenter -eq $expectedControlCenterVersion) {
        Write-Output "Mahoraga $($existing.version) is already running at http://127.0.0.1:4782"
        exit 0
    }
    Write-Output "Replacing Mahoraga $($existing.version) / UI protocol $($existing.versions.controlCenter) with verified runtime $expectedVersion / UI protocol $expectedControlCenterVersion."
    & (Join-Path $PSScriptRoot 'stop-production.ps1')
    Start-Sleep -Milliseconds 500
}

$process = Start-Process -FilePath $node `
    -ArgumentList @('src\cli.mjs','start') `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) {
        throw "Mahoraga exited during startup with code $($process.ExitCode)."
    }
    try {
        $status = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($status.product -eq 'Mahoraga' -and [string]$status.version -eq $expectedVersion -and [string]$status.versions.controlCenter -eq $expectedControlCenterVersion) {
            Write-Output "Mahoraga $($status.version) production is ready at http://127.0.0.1:4782"
            exit 0
        }
    } catch {}
}

throw 'Mahoraga did not become ready before the startup deadline.'
