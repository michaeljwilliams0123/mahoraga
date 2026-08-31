import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const MICROSOFT_HOSTS = Object.freeze(["sharepoint.com", "microsoft365.com", "office.com", "outlook.office.com", "teams.microsoft.com", "onedrive.live.com", "1drv.ms"]);
const SIGNED_APPLICATIONS = Object.freeze(["chrome", "msedge", "EXCEL", "WINWORD", "POWERPNT", "VISIO", "OUTLOOK", "olk", "ms-teams"]);

const SESSION_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$names = @('chrome','msedge','EXCEL','WINWORD','POWERPNT','VISIO','OUTLOOK','olk','ms-teams')
$visible = @()
foreach ($name in $names) {
  $count = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count
  if ($count -gt 0) { $visible += [PSCustomObject]@{ process = $name; windowCount = $count } }
}
$roots = @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$officeFiles = @('EXCEL.EXE','WINWORD.EXE','POWERPNT.EXE','VISIO.EXE','OUTLOOK.EXE')
$officeDirs = @('C:\Program Files\Microsoft Office\root\Office16','C:\Program Files (x86)\Microsoft Office\root\Office16')
$installed = 0
foreach($dir in $officeDirs) { foreach($file in $officeFiles) { if(Test-Path -LiteralPath (Join-Path $dir $file)) { $installed++ } } }
[PSCustomObject]@{
  interactive = [Environment]::UserInteractive
  sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  applications = $visible
  oneDriveRootCount = @($roots).Count
  installedOfficeApplicationCount = $installed
} | ConvertTo-Json -Compress -Depth 4
`;

export async function executeMicrosoft365Capability(capability, task = {}, worker, dependencies = {}) {
  const adapter = requireAdapter(worker);
  if (capability === "m365.health") return probeMicrosoft365(adapter, dependencies);
  if (capability === "m365.dataverse-status") {
    const status = await probePacAuthentication(dependencies);
    return { verified: status.authenticated, summary: status.authenticated ? "The existing Microsoft Power Platform operating-system authentication profile is active." : "No active reusable Microsoft Power Platform authentication profile was verified.", providerReceipt: status };
  }
  if (capability === "m365.open" || capability === "m365.reason") {
    const target = extractMicrosoftUrl(task?.requestedOutcome, adapter.allowedHostSuffixes);
    const opened = await openInSignedApplication(target, dependencies);
    return {
      verified: opened.verified,
      summary: opened.verified
        ? "Mahoraga opened the approved Microsoft 365 target in the attended signed-in browser session. This receipt proves dispatch and visible application control, not document-content access."
        : "Mahoraga could not verify a visible signed-in browser after dispatching the approved Microsoft 365 target.",
      providerReceipt: { targetHost: target.hostname, scheme: "https", attendedSession: opened.attendedSession, visibleBrowser: opened.visibleBrowser, contentAccessVerified: false },
    };
  }
  throw new Error("unsupported-capability");
}

export async function probeMicrosoft365(adapter, dependencies = {}) {
  if ((dependencies.platform ?? process.platform) !== "win32") return { verified: false, summary: "Microsoft 365 signed-application control requires Windows.", providerHealth: { platformSupported: false } };
  const session = await runPowerShell(dependencies.run ?? execFileAsync, SESSION_SCRIPT);
  const receipt = parseJson(session.stdout, "m365-session-probe-invalid");
  const applications = normalizeApplications(receipt.applications);
  const pac = await probePacAuthentication(dependencies);
  const interactive = receipt.interactive === true;
  const verified = interactive && (applications.length > 0 || boundedCount(receipt.oneDriveRootCount) > 0 || pac.authenticated);
  return {
    verified,
    summary: verified
      ? `Microsoft 365 has an attended Windows execution surface with ${applications.length} visible signed-application type(s), ${boundedCount(receipt.oneDriveRootCount)} synced OneDrive root(s), and ${pac.authenticated ? "an active" : "no active"} Power Platform profile.`
      : "Microsoft 365 apps are installed, but no attended signed-application, synced OneDrive, or reusable Power Platform surface was verified.",
    providerHealth: {
      platformSupported: true,
      interactive,
      visibleApplicationTypes: applications.length,
      applications,
      oneDriveRootCount: boundedCount(receipt.oneDriveRootCount),
      installedOfficeApplicationCount: boundedCount(receipt.installedOfficeApplicationCount),
      dataverseProfileAuthenticated: pac.authenticated,
      directGraphAuthentication: false,
      allowedHostSuffixes: adapter.allowedHostSuffixes.length,
    },
  };
}

export function extractMicrosoftUrl(value, allowedHostSuffixes = MICROSOFT_HOSTS) {
  const matches = String(value ?? "").match(/https:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of matches) {
    let url; try { url = new URL(candidate.replace(/[),.;]+$/, "")); } catch { continue; }
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && allowedHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return url;
  }
  throw new Error("m365-approved-url-required");
}

async function openInSignedApplication(url, dependencies) {
  const launch = dependencies.spawn ?? spawn;
  await new Promise((resolve, reject) => {
    const child = launch("rundll32.exe", ["url.dll,FileProtocolHandler", url.href], { windowsHide: true, stdio: "ignore", shell: false });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`m365-open-exit-${code}`)));
  });
  await delay(dependencies.openVerificationDelayMs ?? 750);
  const session = await runPowerShell(dependencies.run ?? execFileAsync, SESSION_SCRIPT);
  const receipt = parseJson(session.stdout, "m365-open-verification-invalid");
  const applications = normalizeApplications(receipt.applications);
  const visibleBrowser = applications.some((item) => item.process === "chrome" || item.process === "msedge");
  return { verified: receipt.interactive === true && visibleBrowser, attendedSession: receipt.interactive === true, visibleBrowser };
}

async function probePacAuthentication(dependencies = {}) {
  const executable = dependencies.pacExecutable ?? "pac.cmd";
  const run = dependencies.runPac ?? execFileAsync;
  try {
    const { stdout } = await run(executable, ["auth", "list"], { windowsHide: true, timeout: 20000, maxBuffer: 128 * 1024, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE } });
    const authenticated = /^\s*\[\d+\]\s+\*/m.test(String(stdout)) && /OperatingSystem/i.test(String(stdout));
    return { authenticated, authenticationClass: authenticated ? "operating-system-profile" : "unverified" };
  } catch { return { authenticated: false, authenticationClass: "unavailable" }; }
}

function requireAdapter(worker) {
  const adapter = worker?.adapter;
  if (worker?.id !== "microsoft365" || adapter?.kind !== "microsoft365-signed-app" || adapter.attendedSessionRequired !== true || adapter.directGraphAuthentication !== false || !Array.isArray(adapter.allowedHostSuffixes) || adapter.allowedHostSuffixes.join("|") !== MICROSOFT_HOSTS.join("|")) throw new TypeError("Microsoft 365 adapter is invalid.");
  return adapter;
}
async function runPowerShell(run, script) { return run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, timeout: 15000, maxBuffer: 256 * 1024, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, OneDrive: process.env.OneDrive, OneDriveCommercial: process.env.OneDriveCommercial, OneDriveConsumer: process.env.OneDriveConsumer } }); }
function parseJson(value, code) { try { const parsed = JSON.parse(String(value ?? "").trim().split(/\r?\n/).filter(Boolean).at(-1)); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(code); return parsed; } catch { throw new Error(code); } }
function normalizeApplications(value) { const rows = Array.isArray(value) ? value : value ? [value] : []; return rows.map((item) => ({ process: SIGNED_APPLICATIONS.includes(String(item?.process)) ? String(item.process) : "unknown", windowCount: boundedCount(item?.windowCount) })).filter((item) => item.process !== "unknown" && item.windowCount > 0).slice(0, SIGNED_APPLICATIONS.length); }
function boundedCount(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 64 ? number : 0; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
