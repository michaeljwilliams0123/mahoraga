param(
    [ValidatePattern('^https://[A-Za-z0-9.-]+/?$')]
    [string]$WorkspaceUri = 'https://mahoraga-cloud-workspace.vercel.app/'
)

$ErrorActionPreference = 'Stop'
$uri = [uri]$WorkspaceUri
if ($uri.Scheme -ne 'https' -or -not $uri.IsDefaultPort -or $uri.PathAndQuery -ne '/') {
    throw 'Mahoraga workspace URL must be an origin-only HTTPS address.'
}

Start-Process $uri.AbsoluteUri
