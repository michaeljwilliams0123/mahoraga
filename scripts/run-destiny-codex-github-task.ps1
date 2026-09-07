[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$IssueNumber,
    [string]$CodexHome,
    [string]$StateDir
)

$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot 'destiny-codex-github-bridge.mjs'
if (-not (Test-Path -LiteralPath $bridge -PathType Leaf)) {
    throw "Destiny Codex GitHub bridge was not found: $bridge"
}
$node = Get-Command node -ErrorAction Stop
$arguments = @($bridge, '--issue-number', [string]$IssueNumber)
if ($CodexHome) { $arguments += @('--codex-home', $CodexHome) }
if ($StateDir) { $arguments += @('--state-dir', $StateDir) }
& $node.Source @arguments
if ($LASTEXITCODE -ne 0) { throw "Destiny Codex GitHub dispatch failed with exit code $LASTEXITCODE" }
