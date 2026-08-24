import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DESKTOP_APPLICATIONS = Object.freeze({
  chrome: "chrome",
  edge: "msedge",
  excel: "EXCEL",
  word: "WINWORD",
  powerpoint: "POWERPNT",
  visio: "VISIO",
});

const INSPECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$names = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO')
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
  $allowed = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO')
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

  throw new Error("unsupported-capability");
}

export function desktopTarget(task) {
  const alias = String(task?.taskArea ?? "").trim().toLowerCase();
  const processName = DESKTOP_APPLICATIONS[alias];
  if (!processName) throw new Error("desktop-target-not-allowlisted");
  return Object.freeze({ alias, process: processName });
}

async function runPowerShell(run, script, trailingArgs = []) {
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
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH },
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
