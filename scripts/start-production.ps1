[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$state = Join-Path $root 'state'
$pidPath = Join-Path $state 'runtime.pid'
$stdout = Join-Path $state 'runtime.out.log'
$stderr = Join-Path $state 'runtime.err.log'
$node = 'C:\Users\MikeWilliams\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$healthUrl = 'http://127.0.0.1:4782/api/status'

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    throw 'The pinned Node.js runtime is unavailable.'
}

New-Item -ItemType Directory -Path $state -Force | Out-Null

$baseline = Join-Path $state 'release-baseline'
if (Test-Path -LiteralPath $baseline -PathType Container) {
    Get-ChildItem -LiteralPath $baseline -File -Recurse | ForEach-Object {
        $relative = $_.FullName.Substring($baseline.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
        $destination = Join-Path $root $relative
        $needsRestore = -not (Test-Path -LiteralPath $destination -PathType Leaf)
        if (-not $needsRestore) { $needsRestore = (Get-Item -LiteralPath $destination).Length -eq 0 }
        if ($needsRestore) {
            $parent = Split-Path -Parent $destination
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
        }
    }
}

try {
    $existing = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($existing.product -eq 'Mahoraga') {
        Write-Output "Mahoraga $($existing.version) is already running at http://127.0.0.1:4782"
        exit 0
    }
} catch {}

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
        if ($status.product -eq 'Mahoraga') {
            Write-Output "Mahoraga $($status.version) production is ready at http://127.0.0.1:4782"
            exit 0
        }
    } catch {}
}

throw 'Mahoraga did not become ready before the startup deadline.'
