[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'relay\wrangler.toml'
$wrangler = 'wrangler@4.131.0'

$required = @(
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'MAHORAGA_LOCAL_RELAY_TOKEN',
    'MAHORAGA_OWNER_IDENTITY',
    'MAHORAGA_WORKSPACE_ORIGIN'
)
foreach ($name in $required) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) { throw "Required protected environment value is missing: $name" }
}
if ($env:MAHORAGA_LOCAL_RELAY_TOKEN -notmatch '^[A-Za-z0-9_-]{32,256}$') { throw 'Relay token format is invalid.' }
$workspace = [Uri]$env:MAHORAGA_WORKSPACE_ORIGIN
if ($workspace.Scheme -ne 'https' -or $workspace.AbsoluteUri.TrimEnd('/') -ne $env:MAHORAGA_WORKSPACE_ORIGIN.TrimEnd('/')) { throw 'Workspace origin must be an exact HTTPS origin.' }

$legacyWorkspace = [Environment]::GetEnvironmentVariable('MAHORAGA_LEGACY_WORKSPACE_ORIGIN')
if (-not [string]::IsNullOrWhiteSpace($legacyWorkspace)) {
    $legacy = [Uri]$legacyWorkspace
    if ($legacy.Scheme -ne 'https' -or $legacy.AbsoluteUri.TrimEnd('/') -ne $legacyWorkspace.TrimEnd('/')) { throw 'Legacy workspace origin must be an exact HTTPS origin.' }
}

$secretPayload = [ordered]@{
    'MAHORAGA_LOCAL_RELAY_TOKEN' = $env:MAHORAGA_LOCAL_RELAY_TOKEN
    'MAHORAGA_OWNER_IDENTITY' = $env:MAHORAGA_OWNER_IDENTITY
    'MAHORAGA_WORKSPACE_ORIGIN' = $env:MAHORAGA_WORKSPACE_ORIGIN
    'MAHORAGA_LEGACY_WORKSPACE_ORIGIN' = $null
}
if (-not [string]::IsNullOrWhiteSpace($legacyWorkspace)) {
    $secretPayload['MAHORAGA_LEGACY_WORKSPACE_ORIGIN'] = $legacyWorkspace
}

Push-Location $root
try {
    $secretJson = $secretPayload | ConvertTo-Json -Compress
    $secretJson | & npx.cmd --yes $wrangler secret bulk --config $config
    if ($LASTEXITCODE -ne 0) { throw 'Unable to synchronize Cloudflare Worker secrets.' }
    & npx.cmd --yes $wrangler deploy --config $config
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare relay deployment failed.' }
} finally {
    Pop-Location
}

Write-Output 'Cloudflare relay deployed with protected owner, primary origin, optional legacy origin, and local runtime authentication.'
