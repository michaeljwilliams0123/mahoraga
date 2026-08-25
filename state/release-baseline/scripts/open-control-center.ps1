param(
    [ValidatePattern('^http://127\.0\.0\.1:\d{2,5}$')]
    [string]$BaseUri = 'http://127.0.0.1:4782'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tokenPath = Join-Path $root 'state\primary-codex.token'
if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
    throw 'Mahoraga primary token is unavailable. Start the runtime once before opening the Control Center.'
}

$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if ($token.Length -lt 32) { throw 'Mahoraga primary token is invalid.' }
$headers = @{ Authorization = "Bearer $token" }
$result = Invoke-RestMethod -Method Post -Uri "$BaseUri/api/session/bootstrap-nonce" -Headers $headers -TimeoutSec 5
if (-not $result.nonce) { throw 'Mahoraga did not issue a Control Center bootstrap nonce.' }
$url = "$BaseUri/session/bootstrap?nonce=$([uri]::EscapeDataString($result.nonce))"
Start-Process $url
