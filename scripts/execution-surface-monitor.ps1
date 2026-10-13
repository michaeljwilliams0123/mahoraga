[CmdletBinding()]
param(
    [switch]$AuditOnly,
    [string]$RuntimeHome = (Join-Path $env:USERPROFILE '.mahoraga-runtime')
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $RuntimeHome 'tools'
$probe = Join-Path $root 'execution-surface-smoke.ts'
$logDir = Join-Path $RuntimeHome 'state\local-recovery'
$logPath = Join-Path $logDir 'surfaces.jsonl'
$record = [ordered]@{ observedAt=(Get-Date).ToUniversalTime().ToString('o'); status='unverified'; expectedSha=$null; result=$null }
try {
    if (-not (Test-Path -LiteralPath $probe -PathType Leaf)) { throw 'smoke-script-missing' }
    $ref = (& git ls-remote 'https://github.com/michaeljwilliams0123/mahoraga.git' 'refs/heads/main' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $ref -notmatch '^([a-f0-9]{40})\s+refs/heads/main$') { throw 'authoritative-source-unavailable' }
    $record.expectedSha = $Matches[1]
    $output = (& node $probe --sha $record.expectedSha 2>$null)
    $exitCode = $LASTEXITCODE
    $value = $output | ConvertFrom-Json
    if ($exitCode -ne 0 -or $value.probePassed -ne $true) { throw 'surface-health-not-verified' }
    $record.status = 'verified-surface-reachability'
    $record.result = [ordered]@{ local=$value.local; workspace=$value.cloud.workspace;
        pages=$value.cloud.pages; gateway=$value.cloud.ownerGateway; cloudSha=$value.cloud.sha;
        authenticatedExecution='not-tested'; physicalMobileSession='not-tested' }
} catch {
    $record.status = 'degraded'
    $record.result = [ordered]@{ reason=([string]$_.Exception.Message).Substring(0,[Math]::Min(100,([string]$_.Exception.Message).Length)) }
}
$line = $record | ConvertTo-Json -Depth 6 -Compress
Write-Output $line
if (-not $AuditOnly) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 524288) {
        Move-Item -LiteralPath $logPath -Destination ($logPath + '.previous') -Force
    }
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}
if ($record.status -ne 'verified-surface-reachability') { exit 1 }
exit 0
