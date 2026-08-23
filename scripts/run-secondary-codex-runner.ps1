[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$env:OPENAI_API_KEY = $null
$env:CODEX_API_KEY = $null
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $PSScriptRoot 'secondary-codex-runner.mjs'

function Find-Node {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
  throw 'Node.js was not found. Open Codex Desktop once or install a supported Node.js 24+ runtime, then retry.'
}

$node = Find-Node
Push-Location $root
try { & $node $cli 'run-once'; exit $LASTEXITCODE }
finally { Pop-Location }
