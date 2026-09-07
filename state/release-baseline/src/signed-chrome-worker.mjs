import { spawn as spawnProcess, execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CHROME_SESSION_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$windows = @(Get-Process -Name 'chrome' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
[PSCustomObject]@{
  interactive = [Environment]::UserInteractive
  sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  chrome = [PSCustomObject]@{
    visibleWindowCount = $windows.Count
    installed = $true
  }
} | ConvertTo-Json -Compress -Depth 4
`;

export async function executeSignedChromeCapability(capability, task = {}, worker, dependencies = {}) {
  requireSignedChromeWorker(worker);
  if (capability === "chrome.health") return probeSignedChrome(worker, dependencies);
  if (capability !== "chrome.open") throw new Error("unsupported-capability");
  if ((dependencies.platform ?? process.platform) !== "win32") throw new Error("chrome-windows-required");

  const target = extractPublicHttpsUrl(task?.requestedOutcome);
  const session = await probeSignedChrome(worker, dependencies);
  if (!session.verified) throw new Error("chrome-attended-session-required");

  const launch = await openInSignedChrome(target, dependencies);
  if (!launch.verified) throw new Error("chrome-visible-window-required");

  return {
    verified: true,
    summary: `Signed Chrome opened an approved public HTTPS target on ${target.hostname} in the attended session.`,
    executionPlane: "local-attended",
    providerReceipt: {
      targetHost: target.hostname,
      targetScheme: "https",
      attendedSession: true,
      visibleChrome: true,
      contentAccessVerified: false,
    },
  };
}

export async function probeSignedChrome(worker, {
  platform = process.platform,
  run = execFileAsync,
  locateChrome = locateChromeExecutable,
} = {}) {
  requireSignedChromeWorker(worker);
  if (platform !== "win32") {
    return {
      verified: false,
      summary: "Signed Chrome requires an attended Windows session.",
      providerHealth: { platformSupported: false, attendedSession: false, visibleChrome: false, chromeInstalled: false },
    };
  }

  let executable = null;
  try { executable = await locateChrome(); } catch { executable = null; }
  const result = await runPowerShell(run, CHROME_SESSION_SCRIPT);
  const state = parseJsonLine(result.stdout, "chrome-session-invalid");
  const interactive = state.interactive === true && Number.isInteger(Number(state.sessionId));
  const visibleWindowCount = boundedCount(state?.chrome?.visibleWindowCount);
  const installed = Boolean(executable) && state?.chrome?.installed !== false;
  const verified = interactive && installed;
  return {
    verified,
    summary: verified
      ? `Signed Chrome verified an attended session; ${visibleWindowCount} visible Chrome window(s) are currently present.`
      : "Signed Chrome could not verify an attended installed Chrome session.",
    providerHealth: {
      platformSupported: true,
      attendedSession: interactive,
      visibleChrome: visibleWindowCount > 0,
      visibleWindowCount,
      chromeInstalled: installed,
    },
  };
}

export async function openInSignedChrome(target, {
  platform = process.platform,
  run = execFileAsync,
  locateChrome = locateChromeExecutable,
  spawn = spawnProcess,
  openVerificationDelayMs = 250,
} = {}) {
  if (platform !== "win32") throw new Error("chrome-windows-required");
  const executable = await locateChrome();
  if (!executable) throw new Error("chrome-executable-required");
  await launchChrome(spawn, executable, ["--new-tab", target.href]);
  if (openVerificationDelayMs > 0) await delay(openVerificationDelayMs);
  const result = await runPowerShell(run, CHROME_SESSION_SCRIPT);
  const state = parseJsonLine(result.stdout, "chrome-session-invalid");
  return Object.freeze({
    verified: state.interactive === true && boundedCount(state?.chrome?.visibleWindowCount) > 0,
    visibleWindowCount: boundedCount(state?.chrome?.visibleWindowCount),
  });
}

export function extractPublicHttpsUrl(value) {
  const source = String(value ?? "");
  const matches = source.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of matches.slice(0, 8)) {
    let target;
    try { target = new URL(candidate); } catch { continue; }
    if (target.protocol !== "https:" || target.username || target.password) continue;
    target.hash = "";
    const host = target.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) continue;
    if (privateOrReservedLiteral(host)) continue;
    return target;
  }
  throw new Error("chrome-public-https-url-required");
}

export async function locateChromeExecutable({ env = process.env, exists = access } = {}) {
  const roots = [
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA,
  ].filter(Boolean);
  const candidates = roots.map((root) => path.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  for (const candidate of candidates) {
    try {
      await exists(candidate);
      return candidate;
    } catch {
      // Continue through bounded well-known installation paths only.
    }
  }
  return null;
}

function requireSignedChromeWorker(worker) {
  const policy = worker?.policy;
  if (worker?.id !== "signed-chrome" || !policy || policy.kind !== "google-chrome-signed-app" || policy.attendedSessionRequired !== true || policy.remoteDebuggingAllowed !== false || policy.profileExportAllowed !== false || !Array.isArray(policy.allowedSchemes) || policy.allowedSchemes.join("|") !== "https") {
    throw new Error("signed-chrome-policy-invalid");
  }
}

async function launchChrome(spawn, executable, args) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(executable, args, { windowsHide: false, stdio: "ignore" });
    const timer = setTimeout(() => finish(resolve), 3000);
    timer.unref?.();
    child.once?.("error", (error) => finish(() => reject(error)));
    child.once?.("close", () => finish(resolve));
    function finish(callback) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    }
  });
}

async function runPowerShell(run, script) {
  try {
    return await run("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 128 * 1024,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH },
    });
  } catch (error) {
    throw new Error(`chrome-session-probe-failed:${String(error?.code ?? error?.message ?? "unknown").slice(0, 80)}`);
  }
}

function parseJsonLine(source, code) {
  const line = String(source ?? "").trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line || line.length > 16384) throw new Error(code);
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
    return value;
  } catch {
    throw new Error(code);
  }
}

function privateOrReservedLiteral(value) {
  const host = stripIpv6Brackets(value);
  if (host === "::" || host === "::1" || /^f[cd][0-9a-f:]+$/i.test(host) || /^fe[89ab][0-9a-f:]+$/i.test(host)) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function stripIpv6Brackets(value) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function boundedCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 128 ? number : 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
