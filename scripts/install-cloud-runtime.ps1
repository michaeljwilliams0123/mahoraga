[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.mahoraga-runtime'
$controllerRoot = Join-Path $runtimeHome 'verified-main'
$secretRoot = Join-Path $runtimeHome 'secrets'
$secretFile = Join-Path $secretRoot 'relay-token.dpapi'
$taskName = 'Mahoraga Cloud Runtime'

if (-not (Test-Path -LiteralPath $controllerRoot -PathType Container)) {
    throw 'Install Mahoraga Runtime Convergence before the cloud runtime watchdog.'
}
$runner = Join-Path $controllerRoot 'scripts\run-cloud-runtime.ps1'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'Cloud runtime runner is missing.' }

$secureToken = Read-Host 'Relay token (stored with Windows user DPAPI)' -AsSecureString
$plainToken = [System.Net.NetworkCredential]::new('', $secureToken).Password
if ($plainToken -notmatch '^[A-Za-z0-9_-]{32,256}$') { throw 'Relay token must be 32-256 base64url characters.' }
New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
$secureToken | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding ascii
$plainToken = $null

$argument = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $controllerRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $watchdog) -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started: $taskName"
Write-Output 'Relay credential is DPAPI protected and is never written to task arguments or repository state.'
