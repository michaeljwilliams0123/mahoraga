import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./config.mjs";

const execFileAsync = promisify(execFile);

export const DESKTOP_APPLICATIONS = Object.freeze({
  chrome: "chrome",
  edge: "msedge",
  excel: "EXCEL",
  word: "WINWORD",
  powerpoint: "POWERPNT",
  visio: "VISIO",
  outlook: "olk",
  "outlook-classic": "OUTLOOK",
  teams: "ms-teams",
});

const INSPECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$names = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO','OUTLOOK','olk','ms-teams')
$apps = @()
foreach ($name in $names) {
  $windows = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -gt 0) {
    $apps += [PSCustomObject]@{ process = $name; windowCount = $windows.Count }
  }
}
[PSCustomObject]@{
  interactive = [Environment]::UserInteractive
  sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  applications = $apps
} | ConvertTo-Json -Compress -Depth 4
`;

const FOCUS_SCRIPT = String.raw`
& {
  param([string]$target)
  $ErrorActionPreference = 'Stop'
  $allowed = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO','OUTLOOK','olk','ms-teams')
  if ($allowed -cnotcontains $target) { throw 'desktop-target-not-allowlisted' }
  $windows = @(Get-Process -Name $target -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -ne 1) {
    [PSCustomObject]@{ verified = $false; reason = 'exact-window-required'; windowCount = $windows.Count } | ConvertTo-Json -Compress
    exit 0
  }
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MahoragaDesktopNative {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
  $handle = $windows[0].MainWindowHandle
  $requested = [MahoragaDesktopNative]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 150
  $foreground = [MahoragaDesktopNative]::GetForegroundWindow()
  [PSCustomObject]@{
    verified = ($requested -and $foreground -eq $handle)
    reason = if ($requested -and $foreground -eq $handle) { 'focused' } else { 'focus-verification-failed' }
    windowCount = 1
  } | ConvertTo-Json -Compress
}
`;


const DESKTOP_FILE_LIMIT = 8;
const SHA256 = /^[a-f0-9]{64}$/;

const SYSTEM_INFO_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[PSCustomObject]@{
  verified = $true
  powershellMajor = [int]$PSVersionTable.PSVersion.Major
  process64Bit = [Environment]::Is64BitProcess
  os64Bit = [Environment]::Is64BitOperatingSystem
} | ConvertTo-Json -Compress
`;

const DISK_FREE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetPathRoot([Environment]::SystemDirectory)
$drive = [System.IO.DriveInfo]::new($root)
[PSCustomObject]@{ verified = $true; freeBytes = [Int64]$drive.AvailableFreeSpace } | ConvertTo-Json -Compress
`;

const PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$names = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO','OUTLOOK','olk','ms-teams')
$rows = @()
foreach ($name in $names) {
  $items = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  if ($items.Count -gt 0) {
    $windows = @($items | Where-Object { $_.MainWindowHandle -ne 0 })
    $working = ($items | Measure-Object -Property WorkingSet64 -Sum).Sum
    if ($null -eq $working) { $working = 0 }
    $rows += [PSCustomObject]@{
      process = $name
      processCount = $items.Count
      windowCount = $windows.Count
      workingSetBytes = [Int64]$working
    }
  }
}
[PSCustomObject]@{ processes = $rows } | ConvertTo-Json -Compress -Depth 4
`;

const FILE_HASH_SCRIPT = String.raw`
& {
  $ErrorActionPreference = 'Stop'
  $root = [Environment]::GetEnvironmentVariable('MAHORAGA_DESKTOP_ROOT', 'Process')
  $relative = [Environment]::GetEnvironmentVariable('MAHORAGA_DESKTOP_RELATIVE', 'Process')
  if ([string]::IsNullOrWhiteSpace($root) -or [string]::IsNullOrWhiteSpace($relative)) { throw 'desktop-filesystem-path-invalid' }
  $separator = [System.IO.Path]::DirectorySeparatorChar
  $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd($separator) + $separator
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'desktop-filesystem-path-invalid' }
  $item = Get-Item -LiteralPath $candidate -Force
  if ($item.PSIsContainer) { throw 'desktop-filesystem-file-required' }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'desktop-filesystem-reparse-point-rejected' }
  $digest = Get-FileHash -LiteralPath $candidate -Algorithm SHA256
  [PSCustomObject]@{
    verified = $true
    kind = 'file'
    sizeBytes = [Int64]$item.Length
    sha256 = $digest.Hash.ToLowerInvariant()
  } | ConvertTo-Json -Compress
}
`;

const POWERSHELL_SCRIPTS = Object.freeze({
  "system-info": SYSTEM_INFO_SCRIPT,
  "disk-free": DISK_FREE_SCRIPT,
});

export async function executeDesktopCapability(capability, task = {}, {
  platform = process.platform,
  run = execFileAsync,
} = {}) {
  if (capability === "desktop.inspect") {
    if (platform !== "win32") {
      return {
        verified: false,
        summary: "Desktop Worker requires an attended Windows session.",
        receiptMetadata: {
          platformSupported: false,
          allowlistedApplications: Object.keys(DESKTOP_APPLICATIONS),
        },
      };
    }
    const result = await runPowerShell(run, INSPECT_SCRIPT);
    const receipt = parseJsonLine(result.stdout, "desktop-inspect-invalid");
    const applications = normalizeApplications(receipt.applications);
    const verified = receipt.interactive === true && Number.isInteger(Number(receipt.sessionId));
    return {
      verified,
      summary: verified
        ? `Desktop inspection verified an attended Windows session with ${applications.length} allowlisted application type(s) visible.`
        : "Desktop inspection could not verify an attended Windows session.",
      receiptMetadata: {
        platformSupported: true,
        interactive: receipt.interactive === true,
        sessionId: Number(receipt.sessionId),
        applications,
      },
    };
  }

  if (capability === "desktop.interact") {
    if (platform !== "win32") throw new Error("desktop-windows-required");
    const target = desktopTarget(task);
    const action = String(task?.requestedOutcome ?? "").trim().toLowerCase();
    if (action !== "focus-window") throw new Error("desktop-action-not-allowlisted");
    const result = await runPowerShell(run, FOCUS_SCRIPT, [target.process]);
    const receipt = parseJsonLine(result.stdout, "desktop-focus-invalid");
    const verified = receipt.verified === true;
    return {
      verified,
      summary: verified
        ? `Desktop Worker focused the single allowlisted ${target.alias} window and re-verified foreground state.`
        : `Desktop Worker did not focus ${target.alias}: ${safeReason(receipt.reason)}.`,
      receiptMetadata: {
        application: target.alias,
        action: "focus-window",
        verified,
        reason: safeReason(receipt.reason),
        windowCount: boundedCount(receipt.windowCount),
      },
    };
  }


  if (capability === "desktop.powershell") {
    if (platform !== "win32") throw new Error("desktop-windows-required");
    const scriptId = String(task?.requestedOutcome ?? "").trim().toLowerCase();
    const script = POWERSHELL_SCRIPTS[scriptId];
    if (!script) throw new Error("desktop-powershell-script-not-allowlisted");
    const result = await runPowerShell(run, script);
    const receipt = parseJsonLine(result.stdout, "desktop-powershell-invalid");
    if (receipt.verified !== true) throw new Error("desktop-powershell-invalid");
    return {
      verified: true,
      summary: `Desktop Worker completed the fixed ${scriptId} diagnostic.`,
      receiptMetadata: normalizePowerShellReceipt(scriptId, receipt),
    };
  }

  if (capability === "desktop.filesystem") {
    if (platform !== "win32") throw new Error("desktop-windows-required");
    if (String(task?.requestedOutcome ?? "").trim().toLowerCase() !== "hash-allowed-files") {
      throw new Error("desktop-filesystem-action-not-allowlisted");
    }
    const paths = desktopFilesystemPaths(task);
    const entries = [];
    for (const relativePath of paths) {
      const result = await runPowerShell(run, FILE_HASH_SCRIPT, [], { MAHORAGA_DESKTOP_ROOT: ROOT, MAHORAGA_DESKTOP_RELATIVE: relativePath });
      const receipt = parseJsonLine(result.stdout, "desktop-filesystem-invalid");
      if (receipt.verified !== true || receipt.kind !== "file" || !SHA256.test(String(receipt.sha256 ?? ""))) {
        throw new Error("desktop-filesystem-invalid");
      }
      entries.push({
        pathSha256: sha256Text(relativePath),
        kind: "file",
        sizeBytes: boundedBytes(receipt.sizeBytes),
        sha256: String(receipt.sha256),
      });
    }
    return {
      verified: true,
      summary: `Desktop Worker hashed ${entries.length} allowlisted repository file(s) without persisting file content or paths.`,
      receiptMetadata: { entries },
    };
  }

  if (capability === "desktop.processes") {
    if (platform !== "win32") throw new Error("desktop-windows-required");
    const result = await runPowerShell(run, PROCESS_SCRIPT);
    const receipt = parseJsonLine(result.stdout, "desktop-processes-invalid");
    const processes = normalizeProcesses(receipt.processes);
    return {
      verified: true,
      summary: `Desktop Worker inspected ${processes.length} allowlisted process type(s) without command lines or window titles.`,
      receiptMetadata: { processes },
    };
  }

  throw new Error("unsupported-capability");
}


function normalizePowerShellReceipt(scriptId, receipt) {
  if (scriptId === "system-info") {
    const powershellMajor = Number(receipt.powershellMajor);
    if (!Number.isInteger(powershellMajor) || powershellMajor < 1 || powershellMajor > 99) throw new Error("desktop-powershell-invalid");
    if (typeof receipt.process64Bit !== "boolean" || typeof receipt.os64Bit !== "boolean") throw new Error("desktop-powershell-invalid");
    return { scriptId, powershellMajor, process64Bit: receipt.process64Bit, os64Bit: receipt.os64Bit };
  }
  if (scriptId === "disk-free") return { scriptId, freeBytes: boundedBytes(receipt.freeBytes) };
  throw new Error("desktop-powershell-script-not-allowlisted");
}

function desktopFilesystemPaths(task) {
  const values = task?.allowedPaths;
  if (!Array.isArray(values) || values.length < 1 || values.length > DESKTOP_FILE_LIMIT) throw new Error("desktop-filesystem-path-invalid");
  return values.map((value) => {
    const raw = String(value ?? "").trim();
    const normalized = raw.replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!normalized || normalized === "." || /[\0\r\n:]/.test(normalized) || normalized.startsWith("/") || normalized.split("/").includes("..")) {
      throw new Error("desktop-filesystem-path-invalid");
    }
    const resolved = path.resolve(ROOT, ...normalized.split("/"));
    const relative = path.relative(ROOT, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("desktop-filesystem-path-invalid");
    return relative.replace(/\\/g, "/");
  });
}

function normalizeProcesses(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.slice(0, Object.keys(DESKTOP_APPLICATIONS).length).map((row) => ({
    process: Object.values(DESKTOP_APPLICATIONS).includes(String(row?.process)) ? String(row.process) : "unknown",
    processCount: boundedCount(row?.processCount),
    windowCount: boundedCount(row?.windowCount),
    workingSetBytes: boundedBytes(row?.workingSetBytes),
  })).filter((row) => row.process !== "unknown" && row.processCount > 0);
}

function boundedBytes(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function desktopTarget(task) {
  const alias = String(task?.taskArea ?? "").trim().toLowerCase();
  const processName = DESKTOP_APPLICATIONS[alias];
  if (!processName) throw new Error("desktop-target-not-allowlisted");
  return Object.freeze({ alias, process: processName });
}

async function runPowerShell(run, script, trailingArgs = [], extraEnv = {}) {
  try {
    return await run("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
      ...trailingArgs,
    ], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 256 * 1024,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, ...extraEnv },
    });
  } catch (error) {
    throw new Error(`desktop-powershell-failed:${String(error?.code ?? error?.message ?? "unknown").slice(0, 80)}`);
  }
}

function parseJsonLine(source, code) {
  const line = String(source ?? "").trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line || line.length > 32768) throw new Error(code);
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
    return value;
  } catch {
    throw new Error(code);
  }
}

function normalizeApplications(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.slice(0, Object.keys(DESKTOP_APPLICATIONS).length).map((row) => ({
    process: Object.values(DESKTOP_APPLICATIONS).includes(String(row?.process)) ? String(row.process) : "unknown",
    windowCount: boundedCount(row?.windowCount),
  })).filter((row) => row.process !== "unknown" && row.windowCount > 0);
}

function boundedCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 64 ? number : 0;
}

function safeReason(value) {
  const reason = String(value ?? "verification-failed").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  return reason || "verification-failed";
}
