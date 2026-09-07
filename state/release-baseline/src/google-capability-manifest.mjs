const GOOGLE_HOSTS = Object.freeze([
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

const GOOGLE_POLICY = Object.freeze({
  kind: "google-workspace-signed-chrome",
  attendedSessionRequired: true,
  directGoogleApiAuthentication: false,
  remoteDebuggingAllowed: false,
  allowedHostSuffixes: GOOGLE_HOSTS,
});

const CHROME_POLICY = Object.freeze({
  kind: "google-chrome-signed-app",
  attendedSessionRequired: true,
  remoteDebuggingAllowed: false,
  profileExportAllowed: false,
  allowedSchemes: Object.freeze(["https"]),
});

export const GOOGLE_CAPABILITY_WORKERS = Object.freeze([
  Object.freeze({
    id: "google-workspace",
    label: "Google Workspace Worker",
    implementationRevision: "signed-chrome-1.0",
    enabled: true,
    costClass: "licensed-cloud",
    dataClasses: Object.freeze(["enterprise"]),
    capabilities: Object.freeze(["google.health", "google.open"]),
    acceptedTaskTypes: Object.freeze(["google-workspace"]),
    timeoutMs: 120000,
    concurrency: 1,
    healthProbe: "google.health",
    capabilityCanaries: Object.freeze({ "google.health": "health", "google.open": "provider-derived" }),
    executionPlane: "local-attended",
    routing: Object.freeze({
      interfaceType: "desktop-automation",
      permissionClass: "attended-google-workspace",
      reliability: 90,
      requiresAttendedDesktop: true,
      executionType: "interactive-session",
      latencyMs: 1000,
      maximumWorkload: 1,
      fallbackWorkerIds: Object.freeze(["desktop"]),
    }),
    policy: GOOGLE_POLICY,
  }),
  Object.freeze({
    id: "signed-chrome",
    label: "Signed Google Chrome Worker",
    implementationRevision: "attended-1.0",
    enabled: true,
    costClass: "deterministic",
    dataClasses: Object.freeze(["synthetic", "personal", "enterprise"]),
    capabilities: Object.freeze(["chrome.health", "chrome.open"]),
    acceptedTaskTypes: Object.freeze(["chrome"]),
    timeoutMs: 60000,
    concurrency: 1,
    healthProbe: "chrome.health",
    capabilityCanaries: Object.freeze({ "chrome.health": "health", "chrome.open": "provider-derived" }),
    executionPlane: "local-attended",
    routing: Object.freeze({
      interfaceType: "desktop-automation",
      permissionClass: "attended-signed-chrome",
      reliability: 92,
      requiresAttendedDesktop: true,
      executionType: "interactive-session",
      latencyMs: 500,
      maximumWorkload: 1,
      fallbackWorkerIds: Object.freeze(["desktop"]),
    }),
    policy: CHROME_POLICY,
  }),
]);

export const GOOGLE_CAPABILITY_CONNECTIONS = Object.freeze([
  Object.freeze({
    id: "google-workspace",
    state: "available-attended-signed-chrome",
    endpointClass: "local-application-provider",
    authenticationState: "inherits-signed-google-session",
    capabilities: Object.freeze(["google.health", "google.open"]),
    lastSuccessfulCheck: null,
    latencyMs: null,
    error: null,
    notes: "Google Workspace uses the attended signed Chrome session for approved Workspace product hosts. It does not read browser credentials, export browser state, or claim direct Google API authorization.",
  }),
  Object.freeze({
    id: "google-chrome-signed-session",
    state: "available-attended-session",
    endpointClass: "local-application-provider",
    authenticationState: "inherits-interactive-chrome-session",
    capabilities: Object.freeze(["chrome.health", "chrome.open"]),
    lastSuccessfulCheck: null,
    latencyMs: null,
    error: null,
    notes: "Signed Chrome can open explicit public HTTPS targets in the attended user session. Local debugging endpoints, browser-state export, and page-content verification are outside this capability.",
  }),
]);

export function applyGoogleCapabilityManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return manifest;
  if (!Array.isArray(manifest.workers) || !Array.isArray(manifest.connections)) return manifest;
  for (const worker of GOOGLE_CAPABILITY_WORKERS) {
    if (!manifest.workers.some((item) => item?.id === worker.id)) manifest.workers.push(structuredClone(worker));
  }
  for (const connection of GOOGLE_CAPABILITY_CONNECTIONS) {
    if (!manifest.connections.some((item) => item?.id === connection.id)) manifest.connections.push(structuredClone(connection));
  }
  return manifest;
}

export function validateGoogleCapabilityWorkers(manifest) {
  const google = manifest?.workers?.find((item) => item?.id === "google-workspace");
  const chrome = manifest?.workers?.find((item) => item?.id === "signed-chrome");
  if (!sameWorkerBoundary(google, GOOGLE_CAPABILITY_WORKERS[0])) throw new TypeError("Google Workspace adapter boundary is invalid.");
  if (!sameWorkerBoundary(chrome, GOOGLE_CAPABILITY_WORKERS[1])) throw new TypeError("Signed Chrome adapter boundary is invalid.");
  return true;
}

function sameWorkerBoundary(actual, expected) {
  if (!actual || typeof actual !== "object") return false;
  const fields = ["id", "enabled", "executionPlane", "healthProbe"];
  if (fields.some((field) => actual[field] !== expected[field])) return false;
  if (actual.routing?.requiresAttendedDesktop !== true || actual.routing?.interfaceType !== expected.routing.interfaceType || actual.routing?.permissionClass !== expected.routing.permissionClass) return false;
  if (JSON.stringify(actual.capabilities) !== JSON.stringify(expected.capabilities)) return false;
  if (JSON.stringify(actual.policy) !== JSON.stringify(expected.policy)) return false;
  return true;
}
