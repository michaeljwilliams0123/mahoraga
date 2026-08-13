[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $root 'state\runtime.pid'

if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) {
    Write-Output 'Mahoraga production is not running.'
    exit 0
}

$runtimePid = [int](Get-Content -Raw -LiteralPath $pidPath)
$process = Get-Process -Id $runtimePid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'node') {
    Stop-Process -Id $runtimePid
    $process.WaitForExit(5000) | Out-Null
}
Remove-Item -LiteralPath $pidPath -Force
Write-Output 'Mahoraga production stopped.'

