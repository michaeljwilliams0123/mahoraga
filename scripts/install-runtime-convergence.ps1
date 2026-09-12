[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$userProfile = [Environment]::GetFolderPath('UserProfile')
$runtimeHome = Join-Path $userProfile '.mahoraga-runtime'
$controllerRoot = Join-Path $runtimeHome 'verified-main'
$taskName = 'Mahoraga Runtime Convergence'

New-Item -ItemType Directory -Path $runtimeHome -Force | Out-Null
& git -C $root fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch protected main.' }
$target = (& git -C $root rev-parse origin/main).Trim()
if ($target -notmatch '^[0-9a-fA-F]{40}$') { throw 'Protected main commit is invalid.' }

function New-ControllerWorktree {
    if (Test-Path -LiteralPath $controllerRoot) {
        & git -C $root worktree remove --force $controllerRoot 2>$null
        if ($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath $controllerRoot)) {
            Remove-Item -LiteralPath $controllerRoot -Recurse -Force
        }
        & git -C $root worktree prune
        if ($LASTEXITCODE -ne 0) { throw 'Unable to prune stale convergence worktree metadata.' }
    }
    & git -C $root worktree add --detach $controllerRoot $target
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create dedicated convergence worktree.' }
}

if (-not (Test-Path -LiteralPath $controllerRoot -PathType Container)) {
    New-ControllerWorktree
} else {
    & git -C $controllerRoot sparse-checkout disable 2>$null
    $sparseDisableExit = $LASTEXITCODE
    if ($sparseDisableExit -eq 0) {
        & git -C $controllerRoot fetch origin main --quiet
    }
    if ($sparseDisableExit -ne 0 -or $LASTEXITCODE -ne 0) {
        New-ControllerWorktree
    } else {
        & git -C $controllerRoot reset --hard $target | Out-Null
        if ($LASTEXITCODE -ne 0) { New-ControllerWorktree }
    }
}

$controller = Join-Path $controllerRoot 'scripts\runtime-convergence.ps1'
if (-not (Test-Path -LiteralPath $controller -PathType Leaf)) {
    New-ControllerWorktree
}
if (-not (Test-Path -LiteralPath $controller -PathType Leaf)) { throw 'Runtime convergence controller is missing after repair.' }

$argument = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$controller`" -ControllerRoot `"$controllerRoot`" -Port 4783"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $controllerRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started: $taskName"
Write-Output "Controller root: $controllerRoot"
Write-Output 'Convergence is deterministic and invokes no paid/model provider.'
