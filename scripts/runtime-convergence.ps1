[CmdletBinding()]
param(
    [string]$ControllerRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$Port = 4783
)

$ErrorActionPreference = 'Stop'
$runtimeHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.mahoraga-runtime'
$stateRoot = Join-Path $runtimeHome 'state\candidate-4783'
$convergenceRoot = Join-Path $runtimeHome 'convergence'
$rollbackRoot = Join-Path $runtimeHome 'rollback'
$relaySecretFile = Join-Path $runtimeHome 'secrets\relay-token.dpapi'
$healthUrl = "http://127.0.0.1:$Port/api/status"
$repository = 'origin'

function Resolve-Commit([string]$Value, [string]$Label) {
    $commit = ([string]$Value).Trim().ToLowerInvariant()
    if ($commit -notmatch '^[0-9a-f]{40}$') { throw "$Label commit is invalid." }
    return $commit
}

function Read-RelayToken {
    if (-not (Test-Path -LiteralPath $relaySecretFile -PathType Leaf)) { return $null }
    $ciphertext = (Get-Content -Raw -LiteralPath $relaySecretFile).Trim()
    if (-not $ciphertext) { throw 'Stored relay token is empty.' }
    $secureToken = ConvertTo-SecureString $ciphertext
    $relayToken = [System.Net.NetworkCredential]::new('', $secureToken).Password
    if ($relayToken -notmatch '^[A-Za-z0-9_-]{32,256}$') { throw 'Stored relay token is invalid.' }
    return $relayToken
}

function Get-LiveStatus {
    try { return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 }
    catch { return $null }
}

function Get-ListenerPid {
    $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { return $null }
    return [int]$listener.OwningProcess
}

function Stop-Listener([int]$Pid) {
    if (-not $Pid) { return }
    $process = Get-Process -Id $Pid -ErrorAction SilentlyContinue
    if (-not $process -or $process.ProcessName -ne 'node') { throw 'Candidate listener is not a Node.js process.' }
    Stop-Process -Id $Pid
    $process.WaitForExit(5000) | Out-Null
}

function Find-SourceWorktree([string]$Commit) {
    $lines = & git -C $ControllerRoot worktree list --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate Mahoraga worktrees.' }
    $current = $null
    foreach ($line in $lines) {
        if ($line -like 'worktree *') { $current = $line.Substring(9).Trim() }
        elseif ($line -eq "HEAD $Commit" -and $current) {
            $candidateState = Join-Path $current 'state\candidate-4783'
            if (Test-Path -LiteralPath (Join-Path $candidateState 'mahoraga.sqlite') -PathType Leaf) { return $current }
        }
    }
    throw 'Unable to resolve the running source worktree and durable candidate state.'
}

function Ensure-RollbackWorktree([string]$Commit) {
    $path = Join-Path $rollbackRoot $Commit
    if (Test-Path -LiteralPath $path -PathType Container) { return $path }
    New-Item -ItemType Directory -Path $rollbackRoot -Force | Out-Null
    & git -C $ControllerRoot worktree add --detach $path $Commit
    if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare rollback worktree.' }
    return $path
}

function Start-Candidate([string]$Root, [string]$ExpectedCommit) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $stdout = Join-Path $convergenceRoot "runtime-$ExpectedCommit.out.log"
    $stderr = Join-Path $convergenceRoot "runtime-$ExpectedCommit.err.log"
    New-Item -ItemType Directory -Path $convergenceRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    $env:MAHORAGA_DATABASE_FILE = Join-Path $stateRoot 'mahoraga.sqlite'
    $env:MAHORAGA_EXPECTED_SOURCE_COMMIT = $ExpectedCommit
    $relayToken = Read-RelayToken
    $previousRelayToken = $env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN
    try {
        if ($relayToken) { $env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN = $relayToken }
        else { Remove-Item Env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN -ErrorAction SilentlyContinue }
        return Start-Process -FilePath $node `
            -ArgumentList @('src\cli.mjs','start','--port',[string]$Port) `
            -WorkingDirectory $Root -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    } finally {
        $relayToken = $null
        if ($null -ne $previousRelayToken) { $env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN = $previousRelayToken }
        else { Remove-Item Env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN -ErrorAction SilentlyContinue }
    }
}

function Wait-ForCommit([string]$Commit, [bool]$RequireCurrent) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        $status = Get-LiveStatus
        if (-not $status -or $status.product -ne 'Mahoraga') { continue }
        $source = [string]$status.runtime.provenance.sourceCommit
        if ($source -ne $Commit) { continue }
        if (-not $RequireCurrent) { return $status }
        $authority = [string]$status.runtime.provenance.authoritativeSourceCommit
        if ($authority -eq $Commit -and [string]$status.runtime.provenance.state -eq 'current') { return $status }
    }
    return $null
}

function Write-Receipt([hashtable]$Body) {
    New-Item -ItemType Directory -Path $convergenceRoot -Force | Out-Null
    $file = Join-Path $convergenceRoot ("receipt-{0}.json" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))
    $Body.observedAt = (Get-Date).ToUniversalTime().ToString('o')
    $Body.modelInvocations = 0
    $Body | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $file -Encoding utf8
}

function Invoke-VerificationGate {
    Push-Location $ControllerRoot
    try { & npm.cmd run verify; if ($LASTEXITCODE -ne 0) { throw 'Verification gate failed; activation denied.' } }
    finally { Pop-Location }
}

& git -C $ControllerRoot fetch $repository main --quiet
if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh authoritative main.' }
$remoteLine = (& git -C $ControllerRoot ls-remote $repository refs/heads/main).Trim()
if ($LASTEXITCODE -ne 0 -or -not $remoteLine) { throw 'Unable to observe authoritative main.' }
$targetCommit = Resolve-Commit (($remoteLine -split '\s+')[0]) 'authoritative'
$trackingCommit = Resolve-Commit (& git -C $ControllerRoot rev-parse origin/main) 'tracking'
if ($trackingCommit -ne $targetCommit) { throw 'Local tracking ref does not match authoritative main.' }
$currentControllerCommit = Resolve-Commit (& git -C $ControllerRoot rev-parse HEAD) 'controller'
if ($currentControllerCommit -ne $targetCommit) {
    & git -C $ControllerRoot reset --hard $targetCommit | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to advance dedicated convergence checkout.' }
}

$live = Get-LiveStatus
if (-not $live) {
    $occupiedPid = Get-ListenerPid
    if ($occupiedPid) {
        Write-Receipt @{ state = 'listener-conflict'; fromCommit = $null; attemptedCommit = $targetCommit; listenerPid = $occupiedPid }
        throw "Port $Port is occupied but does not expose a verified Mahoraga status endpoint."
    }

    Write-Output "No candidate is active on port $Port; verifying protected main before bootstrap."
    $bootstrapProcess = $null
    try {
        Invoke-VerificationGate
        $bootstrapProcess = Start-Candidate $ControllerRoot $targetCommit
        $bootstrapped = Wait-ForCommit $targetCommit $true
        if (-not $bootstrapped) { throw 'Bootstrapped candidate failed exact-head live canary.' }
        Write-Receipt @{ state = 'bootstrapped'; fromCommit = $null; toCommit = $targetCommit; rollbackCommit = $null }
        Write-Output "Mahoraga candidate bootstrapped at protected main $targetCommit on port $Port."
        exit 0
    } catch {
        if ($bootstrapProcess) {
            $failedPid = Get-ListenerPid
            if ($failedPid -and $failedPid -eq $bootstrapProcess.Id) { Stop-Listener $failedPid }
        }
        Write-Receipt @{ state = 'bootstrap-failed'; fromCommit = $null; attemptedCommit = $targetCommit; error = $_.Exception.Message }
        throw
    }
}
if ($live.product -ne 'Mahoraga') { throw 'Port 4783 is owned by an unexpected service.' }
$sourceCommit = Resolve-Commit ([string]$live.runtime.provenance.sourceCommit) 'running source'
if ($sourceCommit -eq $targetCommit) { Write-Output "Mahoraga is current at $targetCommit."; exit 0 }
if ([string]$live.runtime.provenance.state -ne 'runtime-drift') { throw 'Running Mahoraga is behind main without verified runtime-drift evidence.' }
$liveAuthority = Resolve-Commit ([string]$live.runtime.provenance.authoritativeSourceCommit) 'live authority'
if ($liveAuthority -ne $targetCommit) { throw 'Running Mahoraga authority does not match protected main.' }

Write-Output "Verifying protected main $targetCommit before candidate activation."
Invoke-VerificationGate

$centralStateDatabase = Join-Path $stateRoot 'mahoraga.sqlite'
$centralStateVaultKey = Join-Path $stateRoot 'content-vault.key.dpapi'
$centralStateVaultRoot = Join-Path $stateRoot 'content-vault'
$centralStateReady = (Test-Path -LiteralPath $centralStateDatabase -PathType Leaf) -and (Test-Path -LiteralPath $centralStateVaultKey -PathType Leaf) -and (Test-Path -LiteralPath $centralStateVaultRoot -PathType Container)
$rollbackWorktree = Ensure-RollbackWorktree $sourceCommit
$sourceWorktree = $null
$migrationMarker = Join-Path $convergenceRoot 'durable-state-migrated.json'
if ((Test-Path -LiteralPath $migrationMarker -PathType Leaf) -and -not $centralStateReady) {
    throw 'Centralized candidate state is incomplete after recorded migration.'
}
if (-not $centralStateReady -and -not (Test-Path -LiteralPath $migrationMarker -PathType Leaf)) {
    $sourceWorktree = Find-SourceWorktree $sourceCommit
}

$listenerPid = Get-ListenerPid
if (-not $listenerPid) { throw 'Mahoraga candidate listener disappeared before activation.' }
$replacement = $null
try {
    Stop-Listener $listenerPid
    if ($sourceWorktree) {
        $sourceState = Join-Path $sourceWorktree 'state\candidate-4783'
        New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
        Copy-Item -Path (Join-Path $sourceState '*') -Destination $stateRoot -Recurse -Force
        New-Item -ItemType Directory -Path $convergenceRoot -Force | Out-Null
        @{ sourceCommit = $sourceCommit; migratedAt = (Get-Date).ToUniversalTime().ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $migrationMarker -Encoding utf8
    }
    $replacement = Start-Candidate $ControllerRoot $targetCommit
    $activated = Wait-ForCommit $targetCommit $true
    if (-not $activated) { throw 'Activated candidate failed exact-head live canary.' }
    Write-Receipt @{ state = 'activated'; fromCommit = $sourceCommit; toCommit = $targetCommit; rollbackCommit = $sourceCommit }
    Write-Output "Mahoraga converged from $sourceCommit to $targetCommit on port $Port."
} catch {
    $failedPid = Get-ListenerPid
    if ($failedPid) { Stop-Listener $failedPid }
    $rollbackProcess = Start-Candidate $rollbackWorktree $sourceCommit
    $rolledBack = Wait-ForCommit $sourceCommit $false
    if (-not $rolledBack) {
        Write-Receipt @{ state = 'rollback-failed'; fromCommit = $sourceCommit; attemptedCommit = $targetCommit; error = $_.Exception.Message }
        throw 'Activation failed and rollback runtime did not recover.'
    }
    Write-Receipt @{ state = 'rolled-back'; fromCommit = $sourceCommit; attemptedCommit = $targetCommit; rollbackCommit = $sourceCommit; error = $_.Exception.Message }
    throw
}
