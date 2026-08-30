[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Ensure')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$resolvedParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetDirectoryName($Path))
$resolvedPath = [System.IO.Path]::GetFullPath($Path)
if (-not [System.IO.Directory]::Exists($resolvedParent)) {
  [System.IO.Directory]::CreateDirectory($resolvedParent) | Out-Null
}

if ([System.IO.File]::Exists($resolvedPath)) {
  $protected = [System.IO.File]::ReadAllBytes($resolvedPath)
  $key = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
} else {
  $key = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($key) } finally { $generator.Dispose() }
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $key,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $temporary = "$resolvedPath.$([System.Guid]::NewGuid().ToString('N')).tmp"
  [System.IO.File]::WriteAllBytes($temporary, $protected)
  try {
    [System.IO.File]::Move($temporary, $resolvedPath)
  } finally {
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
  }
}

if ($key.Length -ne 32) { throw 'vault-master-key-invalid' }
[Console]::Out.Write([Convert]::ToBase64String($key))
