[CmdletBinding()]
param([int]$Port = 4783)

$ErrorActionPreference = 'Stop'
$runtimeHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.mahoraga-runtime'
$controllerRoot = Join-Path $runtimeHome 'verified-main'
$stateRoot = Join-Path $runtimeHome 'state\candidate-4783'
$secretFile = Join-Path $runtimeHome 'secrets\relay-token.dpapi'
$healthUrl = "http://127.0.0.1:$Port/api/status"

if (-not (Test-Path -LiteralPath $controllerRoot -PathType Container)) { throw 'Verified Mahoraga runtime checkout is missing.' }
if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) { throw 'Relay token is not installed.' }

try {
    $status = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    if ($status.product -eq 'Mahoraga' -and $status.runtime.healthy -eq $true) {
        Write-Output 'Mahoraga cloud runtime is already online.'
        exit 0
    }
} catch {}

$listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { throw 'Port 4783 is occupied by an unexpected or unhealthy process.' }

$ciphertext = (Get-Content -Raw -LiteralPath $secretFile).Trim()
$secureToken = ConvertTo-SecureString $ciphertext
$relayToken = [System.Net.NetworkCredential]::new('', $secureToken).Password
if ($relayToken -notmatch '^[A-Za-z0-9_-]{32,256}$') { throw 'Stored relay token is invalid.' }
$expectedCommit = (& git -C $controllerRoot rev-parse HEAD).Trim().ToLowerInvariant()
if ($expectedCommit -notmatch '^[0-9a-f]{40}$') { throw 'Verified runtime source commit is invalid.' }

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$env:MAHORAGA_DATABASE_FILE = Join-Path $stateRoot 'mahoraga.sqlite'
$env:MAHORAGA_EXPECTED_SOURCE_COMMIT = $expectedCommit
$env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN = $relayToken
$relayToken = $null

$node = (Get-Command node.exe -ErrorAction Stop).Source
Push-Location $controllerRoot
try {
    & $node 'src\cli.mjs' 'start' '--port' ([string]$Port)
    exit $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
