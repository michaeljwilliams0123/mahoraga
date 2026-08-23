[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$StatusOnly
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path

function Find-Codex {
  $command = Get-Command codex -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw 'The official Codex CLI is not available on PATH for this Windows account.'
}

function Set-KeyringCredentialStore {
  $configDirectory = Join-Path $env:USERPROFILE '.codex'
  $configFile = Join-Path $configDirectory 'config.toml'
  $setting = 'cli_auth_credentials_store = "keyring"'
  New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  $source = if (Test-Path -LiteralPath $configFile -PathType Leaf) {
    [IO.File]::ReadAllText($configFile)
  } else { '' }
  if ($source -match '(?m)^\s*cli_auth_credentials_store\s*=.*$') {
    $updated = [regex]::Replace($source, '(?m)^\s*cli_auth_credentials_store\s*=.*$', $setting)
  } else {
    $separator = if ($source.Length -gt 0 -and -not $source.EndsWith("`n")) { "`r`n" } else { '' }
    $updated = "$source$separator$setting`r`n"
  }
  [IO.File]::WriteAllText($configFile, $updated, [Text.UTF8Encoding]::new($false))
}

function Get-ChatGptLoginStatus([string]$Codex) {
  $output = (& $Codex login status 2>&1 | Out-String).Trim()
  return [pscustomobject]@{
    Ready = ($LASTEXITCODE -eq 0 -and $output -match '(?i)ChatGPT')
    Summary = $output
  }
}

$codex = Find-Codex
& $codex --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The Codex CLI exists but could not start.' }

Set-KeyringCredentialStore
$login = Get-ChatGptLoginStatus $codex
if (-not $login.Ready) {
  if ($StatusOnly) {
    throw 'Codex is not signed in with ChatGPT. Run this script without -StatusOnly to complete one-time device sign-in.'
  }
  Write-Output 'Starting one-time ChatGPT device sign-in. Open the displayed URL and enter its code.'
  & $codex login --device-auth
  if ($LASTEXITCODE -ne 0) { throw 'ChatGPT device sign-in did not complete.' }
  $login = Get-ChatGptLoginStatus $codex
  if (-not $login.Ready) { throw 'Codex sign-in completed without a verifiable ChatGPT subscription session.' }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not available on PATH.' }
$origin = (& git -C $RepositoryRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or -not $origin) { throw 'The Mahoraga checkout must have an origin remote.' }
& git -C $RepositoryRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication or private repository access failed.' }

Write-Output 'ChatGPT Codex subscription authentication: ready'
Write-Output 'Windows keyring credential storage: ready'
Write-Output 'GitHub repository access: ready'
