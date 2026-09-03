[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$TaskArea = 'mahoraga',
  [string]$TargetRepository = 'https://github.com/michaeljwilliams0123/mahoraga.git',
  [string]$TargetCheckout = $RepositoryRoot,
  [string]$AllowedPaths = 'cloud-app,docs,evaluation,scripts,src,test,coordination/results',
  [string]$DefaultBranch = 'main',
  [ValidateRange(5, 240)][int]$MaxRuntimeMinutes = 60,
  [ValidateRange(1, 5)][int]$MaxAttempts = 3
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$TargetCheckout = (Resolve-Path -LiteralPath $TargetCheckout).Path
$runner = Join-Path $RepositoryRoot 'scripts\run-secondary-codex-runner.ps1'
$cli = Join-Path $RepositoryRoot 'scripts\secondary-codex-runner.mjs'
$authBootstrap = Join-Path $RepositoryRoot 'scripts\connect-chatgpt-codex.ps1'
$taskName = 'Mahoraga Secondary Codex Runner'

function Find-Node {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
  throw 'Node.js was not found. Open Codex Desktop once or install a supported Node.js 24+ runtime, then retry.'
}

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Runner launcher is missing: $runner" }
if (-not (Test-Path -LiteralPath $authBootstrap -PathType Leaf)) { throw "Authentication bootstrap is missing: $authBootstrap" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not available on PATH.' }
$codex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codex) { throw 'The Codex CLI is not available on PATH. Install or expose the official Codex CLI for this Windows account, then retry.' }
& $codex.Source --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The Codex CLI exists but could not start for this Windows account.' }

& $authBootstrap -RepositoryRoot $RepositoryRoot -StatusOnly
if ($LASTEXITCODE -ne 0) { throw 'ChatGPT Codex subscription authentication is not ready. Run scripts\connect-chatgpt-codex.ps1 first.' }

$origin = (& git -C $RepositoryRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or -not $origin) { throw 'The Mahoraga checkout must have an origin remote.' }
& git -C $RepositoryRoot fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication or origin access failed.' }

$node = Find-Node
& $node $cli configure --task-area $TaskArea --repository $TargetRepository --checkout $TargetCheckout --allowed-paths $AllowedPaths --default-branch $DefaultBranch --max-runtime-minutes $MaxRuntimeMinutes --max-attempts $MaxAttempts
if ($LASTEXITCODE -ne 0) { throw 'Secondary Codex runner configuration failed.' }

$argument = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $RepositoryRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$trigger.Repetition.Interval = 'PT2M'
$trigger.Repetition.Duration = 'P3650D'
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started: $taskName"
Write-Output "Task area: $TaskArea"
Write-Output "Return branches: secondary/<assignment-id>"
Write-Output "Model attempts per assignment: $MaxAttempts maximum; retries require an explicit retry command"
