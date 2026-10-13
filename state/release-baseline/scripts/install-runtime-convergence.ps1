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

function Assert-SafeControllerWorktree {
    if (-not (Test-Path -LiteralPath $controllerRoot)) { return }
    if (-not (Test-Path -LiteralPath $controllerRoot -PathType Container)) {
        throw 'controller-worktree-target-not-a-directory; existing path preserved.'
    }

    $gitTop = (& git -C $controllerRoot rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $gitTop) {
        throw 'controller-worktree-not-git; existing path preserved.'
    }
    $expectedPath = [System.IO.Path]::GetFullPath($controllerRoot).TrimEnd('\', '/')
    $actualPath = [System.IO.Path]::GetFullPath(([string]$gitTop).Trim()).TrimEnd('\', '/')
    if (-not $expectedPath.Equals($actualPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'controller-worktree-path-mismatch; existing path preserved.'
    }

    $changes = @(& git -C $controllerRoot status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'controller-worktree-status-unavailable; existing path preserved.' }
    if ($changes.Count -ne 0) { throw 'controller-worktree-dirty; existing files preserved.' }

    $attachedBranch = & git -C $controllerRoot symbolic-ref --quiet --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0) {
        throw 'controller-worktree-attached-branch; existing branch preserved.'
    }
    if ($LASTEXITCODE -ne 1) { throw 'controller-worktree-branch-indeterminate; existing path preserved.' }
}

function New-ControllerWorktree {
    if (Test-Path -LiteralPath $controllerRoot) {
        Assert-SafeControllerWorktree
        & git -C $root worktree remove $controllerRoot
        if ($LASTEXITCODE -ne 0) {
            throw 'Cannot safely remove clean detached controller worktree; existing path preserved.'
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
    Assert-SafeControllerWorktree
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
