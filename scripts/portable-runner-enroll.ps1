# Portable, owner-initiated Windows x64 GitHub runner enrollment. Inspect has no side effects.
[CmdletBinding()]
param(
  [ValidateSet('Inspect','Enroll')][string]$Mode = 'Inspect',
  [string]$RunnerDirectory = '',
  [string]$RunnerName = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = 'michaeljwilliams0123/mahoraga'
$version = '2.337.0'
$sha256 = '1150692afa94e71f872017e254ea55b6eece1eece3fe7e3a6d4c93d0a1b85cfc'
$labels = 'mahoraga,zero-credit'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    -not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
  throw 'This enrollment script is only for native Windows x64, not a VM or ARM64 substitute.'
}
foreach ($tool in @('gh','git','node','bash')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing prerequisite: $tool" }
}
$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) {
  throw 'Node.js 24 or newer is required.'
}
if (-not $RunnerDirectory) { $RunnerDirectory = Join-Path $env:SystemDrive 'mahoraga-actions-runner' }
if (-not [IO.Path]::IsPathRooted($RunnerDirectory)) { throw 'RunnerDirectory must be an absolute local path.' }
$RunnerDirectory = [IO.Path]::GetFullPath($RunnerDirectory)
if ($RunnerDirectory.StartsWith('\\')) { throw 'Network-mounted runner directories are prohibited.' }

if ($Mode -eq 'Inspect') {
  Write-Output 'status=inspect-only'
  Write-Output "repository=$repository"
  Write-Output "runnerDirectory=$RunnerDirectory"
  Write-Output 'requiredLabels=self-hosted,Windows,X64,mahoraga,zero-credit'
  Write-Output 'registration=no; credentials=untouched; paidFallback=false'
  return
}

# Do not enroll public repositories: untrusted PRs may execute on self-hosted machines.
$private = (& gh api "repos/$repository" --jq '.private' 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($private) -or $private.Trim() -ne 'true') {
  throw 'Refusing self-hosted enrollment: repository must be private and GitHub CLI owner/admin authenticated.'
}
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open an elevated PowerShell session to install the Windows runner service.'
}
if (Test-Path -LiteralPath $RunnerDirectory) {
  throw 'Runner directory already exists; never overwrite or replace an existing device identity.'
}
if (-not $RunnerName) {
  $hostLabel = ($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
  $RunnerName = "mahoraga-$($hostLabel.Substring(0, [Math]::Min(30, $hostLabel.Length)))-$([guid]::NewGuid().ToString('N').Substring(0,8))"
}
if ($RunnerName -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$') { throw 'Invalid runner name.' }

$archive = Join-Path ([IO.Path]::GetTempPath()) "mahoraga-runner-$([guid]::NewGuid().ToString('N')).zip"
$token = $null
$registration = $null
try {
  $url = "https://github.com/actions/runner/releases/download/v$version/actions-runner-win-x64-$version.zip"
  Invoke-WebRequest -Uri $url -OutFile $archive -MaximumRedirection 5
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -ne $sha256) {
    throw 'Verified GitHub runner archive SHA256 mismatch: refusing installation.'
  }
  [void](New-Item -ItemType Directory -Path $RunnerDirectory -ErrorAction Stop)
  Expand-Archive -LiteralPath $archive -DestinationPath $RunnerDirectory -ErrorAction Stop
  $config = Join-Path $RunnerDirectory 'config.cmd'
  if (-not (Test-Path -LiteralPath $config)) { throw 'Verified archive has no config.cmd.' }

  # Short-lived GitHub token only on this device, never copied from an old runner.
  $registration = (& gh api --method POST "repos/$repository/actions/runners/registration-token" --jq '.token' 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($registration)) {
    throw 'Runner registration token unavailable; owner/admin access required.'
  }
  $token = $registration.Trim()
  Push-Location $RunnerDirectory
  try {
    & $config --unattended --url "https://github.com/$repository" --token $token --name $RunnerName --labels $labels --work '_work' --runasservice
    if ($LASTEXITCODE -ne 0) { throw 'Runner configuration failed; inspect manually, do not blindly retry.' }
  } finally { Pop-Location }
  Write-Output "enrolled=$RunnerName"
  Write-Output 'labels=self-hosted,Windows,X64,mahoraga,zero-credit'
  Write-Output 'Confirm service is online in GitHub Settings > Actions > Runners.'
} finally {
  $token = $null
  $registration = $null
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
