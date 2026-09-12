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

Push-Location $root
try {
    foreach ($name in @('MAHORAGA_LOCAL_RELAY_TOKEN','MAHORAGA_OWNER_IDENTITY','MAHORAGA_WORKSPACE_ORIGIN')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        $value | & npx.cmd --yes $wrangler secret put $name --config $config
        if ($LASTEXITCODE -ne 0) { throw "Unable to set Cloudflare Worker secret: $name" }
    }
    & npx.cmd --yes $wrangler deploy --config $config
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare relay deployment failed.' }
} finally {
    Pop-Location
}

Write-Output 'Cloudflare relay deployed with protected owner, origin, and local runtime authentication.'
