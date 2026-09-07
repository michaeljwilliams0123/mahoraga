import { openInSignedChrome, probeSignedChrome } from "./signed-chrome-worker.mjs";

export const GOOGLE_WORKSPACE_HOSTS = Object.freeze([
  "drive.google.com",
  "docs.google.com",
  "sheets.google.com",
  "slides.google.com",
  "mail.google.com",
  "calendar.google.com",
  "meet.google.com",
  "contacts.google.com",
  "chat.google.com",
]);

export async function executeGoogleWorkspaceCapability(capability, task = {}, worker, dependencies = {}) {
  requireGoogleWorkspaceWorker(worker);
  if (capability === "google.health") {
    const chromeWorker = chromeWorkerView(worker);
    const result = await probeSignedChrome(chromeWorker, dependencies);
    return {
      ...result,
      summary: result.verified
        ? `Google Workspace verified an attended signed Chrome session for ${GOOGLE_WORKSPACE_HOSTS.length} approved product hosts.`
        : "Google Workspace could not verify an attended signed Chrome session.",
      providerHealth: {
        ...result.providerHealth,
        approvedHostCount: GOOGLE_WORKSPACE_HOSTS.length,
        directGoogleApiAuthentication: false,
        contentAccessVerified: false,
      },
    };
  }
  if (capability !== "google.open") throw new Error("unsupported-capability");

  const target = extractGoogleWorkspaceUrl(task?.requestedOutcome);
  const chromeWorker = chromeWorkerView(worker);
  const health = await probeSignedChrome(chromeWorker, dependencies);
  if (!health.verified) throw new Error("google-workspace-attended-session-required");
  const launched = await openInSignedChrome(target, dependencies);
  if (!launched.verified) throw new Error("google-workspace-visible-chrome-required");

  return {
    verified: true,
    summary: `Google Workspace opened ${target.hostname} in attended signed Chrome.`,
    executionPlane: "local-attended",
    providerReceipt: {
      targetHost: target.hostname,
      targetScheme: "https",
      attendedSession: true,
      visibleChrome: true,
      directGoogleApiAuthentication: false,
      contentAccessVerified: false,
    },
  };
}

export function extractGoogleWorkspaceUrl(value) {
  const source = String(value ?? "");
  const matches = source.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of matches.slice(0, 8)) {
    let target;
    try { target = new URL(candidate); } catch { continue; }
    if (target.protocol !== "https:" || target.username || target.password) continue;
    target.hash = "";
    const host = target.hostname.toLowerCase();
    if (!GOOGLE_WORKSPACE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) continue;
    return target;
  }
  throw new Error("google-workspace-approved-url-required");
}

function requireGoogleWorkspaceWorker(worker) {
  const policy = worker?.policy;
  if (worker?.id !== "google-workspace" || !policy || policy.kind !== "google-workspace-signed-chrome" || policy.attendedSessionRequired !== true || policy.directGoogleApiAuthentication !== false || policy.remoteDebuggingAllowed !== false || !Array.isArray(policy.allowedHostSuffixes) || policy.allowedHostSuffixes.join("|") !== GOOGLE_WORKSPACE_HOSTS.join("|")) {
    throw new Error("google-workspace-policy-invalid");
  }
}

function chromeWorkerView(worker) {
  return {
    id: "signed-chrome",
    policy: {
      kind: "google-chrome-signed-app",
      attendedSessionRequired: worker.policy.attendedSessionRequired,
      remoteDebuggingAllowed: worker.policy.remoteDebuggingAllowed,
      profileExportAllowed: false,
      allowedSchemes: ["https"],
    },
  };
}
