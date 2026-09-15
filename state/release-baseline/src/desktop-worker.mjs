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


const TEAMS_SEND_SCRIPT = String.raw`
& {
  $ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  function Write-TeamsReceipt {
    param(
      [bool]$verified,
      [string]$reason,
      [int]$windowCount,
      [bool]$recipientVerified,
      [bool]$draftVerified,
      [bool]$sendInvoked,
      [bool]$postSendVerified
    )
    [PSCustomObject]@{
      verified = $verified
      reason = $reason
      windowCount = $windowCount
      recipientVerified = $recipientVerified
      draftVerified = $draftVerified
      sendInvoked = $sendInvoked
      postSendVerified = $postSendVerified
    } | ConvertTo-Json -Compress
    exit 0
  }

  $recipient = [Environment]::GetEnvironmentVariable('MAHORAGA_TEAMS_RECIPIENT', 'Process')
  $message = [Environment]::GetEnvironmentVariable('MAHORAGA_TEAMS_MESSAGE', 'Process')
  if ([string]::IsNullOrWhiteSpace($recipient) -or [string]::IsNullOrWhiteSpace($message)) {
    Write-TeamsReceipt $false 'communication-send-envelope-invalid' 0 $false $false $false $false
  }

  $windows = @(Get-Process -Name 'ms-teams' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -ne 1) {
    Write-TeamsReceipt $false 'teams-window-required' $windows.Count $false $false $false $false
  }

  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($windows[0].MainWindowHandle)
    if ($null -eq $root) {
      Write-TeamsReceipt $false 'teams-window-required' 1 $false $false $false $false
    }

    $recipientCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $recipient
    )
    $recipientMatches = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $recipientCondition
    )
    if ($recipientMatches.Count -ne 1) {
      Write-TeamsReceipt $false 'recipient-mismatch' 1 $false $false $false $false
    }

    $composerCondition = [System.Windows.Automation.AndCondition]::new(
      [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit
      ),
      [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty,
        'Type a message'
      )
    )
    $composers = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $composerCondition
    )
    if ($composers.Count -ne 1) {
      Write-TeamsReceipt $false 'draft-mismatch' 1 $true $false $false $false
    }

    $composer = $composers.Item(0)
    $valuePatternObject = $null
    if (-not $composer.TryGetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern,
      [ref]$valuePatternObject
    )) {
      Write-TeamsReceipt $false 'draft-mismatch' 1 $true $false $false $false
    }
    $valuePattern = [System.Windows.Automation.ValuePattern]$valuePatternObject
    $valuePattern.SetValue($message)
    if ($valuePattern.Current.Value -cne $message) {
      Write-TeamsReceipt $false 'draft-mismatch' 1 $true $false $false $false
    }

    $buttonCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Button
    )
    $buttons = $root.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $buttonCondition
    )
    $sendButtons = @($buttons | Where-Object {
      $_.Current.Name -cin @('Send', 'Send (Ctrl+Enter)') -and $_.Current.IsEnabled
    })
    if ($sendButtons.Count -ne 1) {
      Write-TeamsReceipt $false 'send-control-unavailable' 1 $true $true $false $false
    }

    $invokePatternObject = $null
    if (-not $sendButtons[0].TryGetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern,
      [ref]$invokePatternObject
    )) {
      Write-TeamsReceipt $false 'send-control-unavailable' 1 $true $true $false $false
    }
    $invokePattern = [System.Windows.Automation.InvokePattern]$invokePatternObject
    $invokePattern.Invoke()

    $postSendVerified = $false
    for ($attempt = 0; $attempt -lt 10; $attempt += 1) {
      Start-Sleep -Milliseconds 250
      try {
        $postRecipients = $root.FindAll(
          [System.Windows.Automation.TreeScope]::Descendants,
          $recipientCondition
        )
        $postComposers = $root.FindAll(
          [System.Windows.Automation.TreeScope]::Descendants,
          $composerCondition
        )
        if ($postRecipients.Count -eq 1 -and $postComposers.Count -eq 1) {
          $postValueObject = $null
          if ($postComposers.Item(0).TryGetCurrentPattern(
            [System.Windows.Automation.ValuePattern]::Pattern,
            [ref]$postValueObject
          )) {
            $postValue = [System.Windows.Automation.ValuePattern]$postValueObject
            if ([string]::IsNullOrEmpty($postValue.Current.Value)) {
              $postSendVerified = $true
              break
            }
          }
        }
      } catch {
        continue
      }
    }

    if (-not $postSendVerified) {
      Write-TeamsReceipt $false 'post-send-verification-failed' 1 $true $true $true $false
    }
    Write-TeamsReceipt $true 'sent' 1 $true $true $true $true
  } catch {
    Write-TeamsReceipt $false 'post-send-verification-failed' 1 $false $false $false $false
  }
}
`;

const COMMUNICATION_SEND_REASONS = new Set([
  "sent",
  "teams-window-required",
  "recipient-mismatch",
  "draft-mismatch",
  "send-control-unavailable",
  "post-send-verification-failed",
  "communication-send-envelope-invalid",
]);

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


  if (capability === "communication.send") {
    if (platform !== "win32") throw new Error("desktop-windows-required");
    const envelope = communicationSendEnvelope(task);
    const result = await runPowerShell(run, TEAMS_SEND_SCRIPT, [], {
      MAHORAGA_TEAMS_RECIPIENT: envelope.recipient,
      MAHORAGA_TEAMS_MESSAGE: envelope.message,
    });
    const receipt = parseJsonLine(result.stdout, "communication-send-receipt-invalid");
    const reason = COMMUNICATION_SEND_REASONS.has(receipt.reason)
      ? receipt.reason
      : "verification-failed";
    const recipientVerified = receipt.recipientVerified === true;
    const draftVerified = receipt.draftVerified === true;
    const sendInvoked = receipt.sendInvoked === true;
    const postSendVerified = receipt.postSendVerified === true;
    const verified = receipt.verified === true
      && reason === "sent"
      && boundedCount(receipt.windowCount) === 1
      && recipientVerified
      && draftVerified
      && sendInvoked
      && postSendVerified;
    const normalizedReason = verified
      ? "sent"
      : reason === "sent" ? "verification-failed" : reason;
    return {
      verified,
      summary: verified
        ? "Desktop Worker verified one recipient-bound Teams send."
        : `Desktop Worker did not verify the recipient-bound Teams send: ${normalizedReason}.`,
      receiptMetadata: {
        application: "teams",
        action: "recipient-bound-send",
        recipientSha256: sha256Text(envelope.recipient),
        messageSha256: sha256Text(envelope.message),
        idempotencyKeySha256: sha256Text(String(task?.idempotencyKey ?? "")),
        windowCount: boundedCount(receipt.windowCount),
        recipientVerified,
        draftVerified,
        sendInvoked,
        postSendVerified,
        reason: normalizedReason,
      },
    };
  }

  throw new Error("unsupported-capability");
}



function communicationSendEnvelope(task) {
  let value;
  try {
    value = JSON.parse(String(task?.requestedOutcome ?? ""));
  } catch {
    throw new Error("communication-send-envelope-invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("communication-send-envelope-invalid");
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "message" || keys[1] !== "recipient") {
    throw new Error("communication-send-envelope-invalid");
  }
  if (
    typeof value.recipient !== "string"
    || value.recipient.trim().length < 1
    || value.recipient.length > 160
    || /[\r\n\u0000]/.test(value.recipient)
    || typeof value.message !== "string"
    || value.message.trim().length < 1
    || value.message.length > 1000
    || /\u0000/.test(value.message)
  ) {
    throw new Error("communication-send-envelope-invalid");
  }
  const recipient = value.recipient.trim();
  if (/\b(?:everyone|everybody|all users|all people|whole (?:team|department|company)|entire (?:team|department|company)|channel|coworkers|colleagues)\b/i.test(recipient)) {
    throw new Error("recipient-not-authorized");
  }
  return Object.freeze({ recipient, message: value.message });
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
