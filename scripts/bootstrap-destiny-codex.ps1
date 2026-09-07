[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProbeId,

    [string]$CodexHome,
    [string]$StateDir,
    [string]$CloudListFile
)

$ErrorActionPreference = 'Stop'
$bootstrap = Join-Path $PSScriptRoot 'bootstrap-destiny-codex.mjs'
if (-not (Test-Path -LiteralPath $bootstrap -PathType Leaf)) {
    throw "Destiny Codex bootstrap script was not found: $bootstrap"
}

$node = Get-Command node -ErrorAction Stop
$arguments = @($bootstrap, '--probe-id', $ProbeId)
if ($CodexHome) { $arguments += @('--codex-home', $CodexHome) }
if ($StateDir) { $arguments += @('--state-dir', $StateDir) }
if ($CloudListFile) { $arguments += @('--cloud-list-file', $CloudListFile) }

& $node.Source @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Destiny Codex bootstrap failed with exit code $LASTEXITCODE"
}
