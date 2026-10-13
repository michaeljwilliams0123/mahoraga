[CmdletBinding()]
param(
    [switch]$AuditOnly,
    [string]$RuntimeHome = (Join-Path $env:USERPROFILE '.mahoraga-runtime')
)
$ErrorActionPreference = 'Stop'
$expectedVersion = '3.6.0'
$expectedCommit = 'e8cbdb4'
$logDir = Join-Path $RuntimeHome 'state\local-recovery'
$logFile = Join-Path $logDir 'checks.jsonl'
function Write-Observation([int]$port,[string]$result,[string]$reason) {
    $record = [ordered]@{ time=(Get-Date).ToUniversalTime().ToString('o'); port=$port; result=$result; reason=$reason }
    $message = $record | ConvertTo-Json -Compress
    Write-Output $message
    if ($AuditOnly) { return }
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 524288) {
        Move-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force
    }
    Add-Content -LiteralPath $logFile -Value $message -Encoding UTF8
}
function Read-Status([int]$port) {
    try { return Invoke-RestMethod -Uri ('http://127.0.0.1:'+$port+'/api/status') -TimeoutSec 2 }
    catch { return $null }
}
function Port-HasListener([int]$port) {
    return $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}
$productionRoot = Join-Path $RuntimeHome 'windows-production-3.6.0'
$candidateLauncher = Join-Path $RuntimeHome 'tools\start-stable-candidate.ps1'
$targets = @(
    @{port=4782; root=$productionRoot; launcher=(Join-Path $productionRoot 'scripts\start-production.ps1')},
    @{port=4783; root=$productionRoot; launcher=$candidateLauncher}
)
$failures = 0
foreach ($target in $targets) {
    $port = [int]$target.port
    $status = Read-Status $port
    if ($null -ne $status) {
        if ($status.product -ne 'Mahoraga' -or $status.version -ne $expectedVersion) {
            Write-Observation $port 'blocked' 'unexpected-runtime-on-port'; $failures++; continue
        }
        $cap = @($status.capabilities | Where-Object { $_.capability -eq 'system.health' }) | Select-Object -First 1
        if ($null -eq $cap -or $cap.availability -ne 'healthy') {
            Write-Observation $port 'degraded' 'health-route-unavailable'; $failures++; continue
        }
        Write-Observation $port 'healthy' 'bounded-local-health'; continue
    }
    if (Port-HasListener $port) {
        Write-Observation $port 'blocked' 'occupied-by-unrecognized-listener'; $failures++; continue
    }
    if ($AuditOnly) {
        Write-Observation $port 'offline' 'audit-only-no-restart'; $failures++; continue
    }
    try {
        if (-not (Test-Path -LiteralPath $target.launcher -PathType Leaf)) { throw 'approved-launcher-missing' }
        $manifest = Get-Content (Join-Path $target.root 'mahoraga.manifest.json') -Raw | ConvertFrom-Json
        if ($manifest.version -ne $expectedVersion) { throw 'rollback-version-mismatch' }
        $sha = (& git -C $target.root rev-parse --short=7 HEAD 2>$null)
        if ($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $expectedCommit) { throw 'rollback-commit-mismatch' }
        & $target.launcher | Out-Null
        Start-Sleep -Milliseconds 300
        $recovered = Read-Status $port
        if ($null -eq $recovered -or $recovered.product -ne 'Mahoraga' -or $recovered.version -ne $expectedVersion) {
            throw 'restart-not-verified'
        }
        Write-Observation $port 'recovered' 'pinned-rollback-restarted'
    } catch {
        Write-Observation $port 'failed' ([string]$_.Exception.Message).Substring(0,[Math]::Min(120,[string]$_.Exception.Message.Length))
        $failures++
    }
}
if ($failures -gt 0) { exit 1 }
exit 0
