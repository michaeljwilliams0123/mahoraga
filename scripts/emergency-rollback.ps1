<#
.SYNOPSIS
  Contains the Mahoraga 7.0 candidate runtime on loopback port 4783.
.DESCRIPTION
  Stops only the 4783 listener, quarantines candidate SQLite state, and optionally
  resets an explicitly marked candidate worktree. The authoritative checkout and
  the 4782 baseline are never reset by this script.
#>

[CmdletBinding()]
param(
  [int]$CandidatePort = 4783,
  [string]$CandidateStateDirectory = "",
  [string]$CandidateWorktree = "",
  [string]$CandidateBaseSha = ""
)

$ErrorActionPreference = "Stop"

if ($CandidatePort -ne 4783) {
  throw "candidate-port-must-be-4783"
}

Write-Host "[CONTAINMENT] Candidate rollback requested for loopback port $CandidatePort." -ForegroundColor Yellow

# 1. Stop only the process currently bound to the candidate port.
$connections = @(Get-NetTCPConnection -LocalPort $CandidatePort -State Listen -ErrorAction SilentlyContinue)
$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $pids) {
  if ($processId -and $processId -ne $PID) {
    Write-Host "[CONTAINMENT] Stopping candidate listener PID $processId." -ForegroundColor Yellow
    Stop-Process -Id $processId -Force -ErrorAction Stop
  }
}

# 2. Quarantine candidate SQLite files without touching the 4782 state directory.
if ($CandidateStateDirectory) {
  $candidateState = [System.IO.Path]::GetFullPath($CandidateStateDirectory)
  if (Test-Path -LiteralPath $candidateState -PathType Container) {
    $parent = Split-Path -Parent $candidateState
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
    $quarantine = Join-Path $parent "candidate-4783-quarantine-$stamp"
    New-Item -ItemType Directory -Path $quarantine -Force | Out-Null
    $stateFiles = @(Get-ChildItem -LiteralPath $candidateState -File -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -match '\.sqlite($|-wal$|-shm$)'
    })
    foreach ($item in $stateFiles) {
      Move-Item -LiteralPath $item.FullName -Destination (Join-Path $quarantine $item.Name) -Force
    }
    Write-Host "[CONTAINMENT] Candidate SQLite state quarantined at $quarantine." -ForegroundColor Green
  }
}

# 3. Repository reset is optional and candidate-worktree-only.
$hasWorktree = -not [string]::IsNullOrWhiteSpace($CandidateWorktree)
$hasBaseSha = -not [string]::IsNullOrWhiteSpace($CandidateBaseSha)
if ($hasWorktree -xor $hasBaseSha) {
  throw "candidate-worktree-and-base-sha-must-be-supplied-together"
}

if ($hasWorktree -and $hasBaseSha) {
  if ($CandidateBaseSha -notmatch '^[0-9a-fA-F]{40}$') {
    throw "candidate-base-sha-invalid"
  }

  $candidateRoot = [System.IO.Path]::GetFullPath($CandidateWorktree).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $authoritativeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($candidateRoot -eq $authoritativeRoot) {
    throw "authoritative-checkout-reset-forbidden"
  }
  if (-not (Test-Path -LiteralPath $candidateRoot -PathType Container)) {
    throw "candidate-worktree-not-found"
  }
  $marker = Join-Path $candidateRoot ".mahoraga-candidate"
  if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
    throw "candidate-worktree-marker-required"
  }

  $reportedRoot = (& git -C $candidateRoot rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($reportedRoot)) {
    throw "candidate-worktree-git-root-invalid"
  }
  $reportedRoot = [System.IO.Path]::GetFullPath($reportedRoot.Trim()).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($reportedRoot -ne $candidateRoot) {
    throw "candidate-worktree-root-mismatch"
  }

  Write-Host "[CONTAINMENT] Resetting explicitly marked candidate worktree to $CandidateBaseSha." -ForegroundColor Yellow
  & git -C $candidateRoot reset --hard $CandidateBaseSha
  if ($LASTEXITCODE -ne 0) { throw "candidate-reset-failed" }
  & git -C $candidateRoot clean -fd
  if ($LASTEXITCODE -ne 0) { throw "candidate-clean-failed" }
}

Write-Host "[CONTAINMENT] Candidate containment complete. The 4782 baseline was not modified." -ForegroundColor Green
