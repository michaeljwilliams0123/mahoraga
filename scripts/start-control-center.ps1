[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = 'C:\Users\MikeWilliams\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    throw 'The pinned Codex Node.js runtime is unavailable.'
}

Set-Location -LiteralPath $root
& $node 'src\cli.mjs' 'start'
exit $LASTEXITCODE

