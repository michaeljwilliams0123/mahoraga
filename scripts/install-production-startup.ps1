[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'start-production.ps1'
$convergenceInstaller = Join-Path $PSScriptRoot 'install-runtime-convergence.ps1'
$taskName = 'Mahoraga Production Runtime'

if (-not (Test-Path -LiteralPath $convergenceInstaller -PathType Leaf)) {
    throw 'Runtime convergence installer is missing.'
}

$argument = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
& $convergenceInstaller
Write-Output "Installed startup task: $taskName"
Write-Output 'Runtime convergence provisioning is installed and started.'
