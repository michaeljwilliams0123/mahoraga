$ErrorActionPreference = 'Stop'
$runtimeHome = Join-Path $env:USERPROFILE '.mahoraga-runtime'
$state = Join-Path $runtimeHome 'state\candidate-stable-4783'
$entry = Join-Path $runtimeHome 'tools\start-stable-candidate.ts'
$node = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$url = 'http://127.0.0.1:4783/api/status'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Pinned Node is unavailable' }
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Candidate entrypoint unavailable' }
New-Item -ItemType Directory -Path $state -Force | Out-Null
try {
  $existing = Invoke-RestMethod -Uri $url -TimeoutSec 2
  if ($existing.product -eq 'Mahoraga' -and $existing.version -eq '3.6.0') {
    Write-Output 'Rollback candidate is already running at 127.0.0.1:4783'
    exit 0
  }
  throw 'Port 4783 occupied by a different application or runtime'
} catch {
  if ($_.Exception.Message -match 'occupied') { throw }
}
$process = Start-Process -FilePath $node -ArgumentList @($entry) -WorkingDirectory (Join-Path $runtimeHome 'windows-production-3.6.0') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'runtime.out.log') -RedirectStandardError (Join-Path $state 'runtime.err.log') -PassThru
Set-Content -Path (Join-Path $state 'runtime.pid') -Value $process.Id
for ($attempt=0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 250
  if ($process.HasExited) { throw "Candidate exited: $($process.ExitCode)" }
  try {
    $s = Invoke-RestMethod -Uri $url -TimeoutSec 2
    if ($s.product -eq 'Mahoraga' -and $s.version -eq '3.6.0') {
      Write-Output 'Mahoraga rollback candidate ready at 127.0.0.1:4783'
      exit 0
    }
  } catch {}
}
throw 'Candidate did not become ready'
