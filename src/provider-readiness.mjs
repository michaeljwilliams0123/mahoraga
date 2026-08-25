export async function collectProviderReadiness(probes, { now = () => new Date() } = {}) {
  const required = ["desktop", "microsoft365", "microsoftQueue", "localReasoner", "githubCopilot", "primaryCodexBuilder", "workspaceAgent"];
  for (const name of required) if (typeof probes?.[name] !== "function") throw new TypeError(`provider-readiness-probe-missing:${name}`);

  const entries = await Promise.all(required.map(async (name) => {
    try { return [name, await probes[name]()]; }
    catch { return [name, { verified: false }]; }
  }));
  const raw = Object.fromEntries(entries);
  const providers = Object.freeze({
    desktop: desktopState(raw.desktop),
    microsoft365: microsoft365State(raw.microsoft365),
    microsoftQueue: queueState(raw.microsoftQueue),
    localReasoner: localReasonerState(raw.localReasoner),
    githubCopilot: copilotState(raw.githubCopilot),
    primaryCodexBuilder: codexState(raw.primaryCodexBuilder),
    workspaceAgent: workspaceAgentState(raw.workspaceAgent),
  });
  const verified = Object.values(providers).filter((item) => item.verified).length;
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    scope: "local-provider-readiness-only",
    activationPerformed: false,
    counts: { verified, total: required.length },
    providers,
    note: "Readiness probes do not activate disabled workers or prove end-to-end task execution.",
  });
}

function desktopState(result) {
  const receipt = result?.receiptMetadata ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    platformSupported: receipt.platformSupported === true,
    interactive: receipt.interactive === true,
    allowlistedApplicationTypesVisible: Array.isArray(receipt.applications) ? receipt.applications.length : 0,
  });
}

function queueState(result) {
  const receipt = result?.receiptMetadata ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    configurationReady: receipt.prefixReady === true && receipt.dataverseUrlConfigured === true && receipt.tenantConfigured === true && receipt.queueScriptReady === true && receipt.authScriptReady === true,
    silentAuthAvailable: receipt.silentAuthAvailable === true,
    authDiagnosis: allowed(receipt.authDiagnosis, ["not-probed", "probe-unavailable", "silent-tier-available", "interactive-required", "indeterminate"], "indeterminate"),
  });
}
function microsoft365State(result) {
  const health = result?.providerHealth ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    interactive: health.interactive === true,
    visibleApplicationTypes: boundedCount(health.visibleApplicationTypes, 32),
    oneDriveRootCount: boundedCount(health.oneDriveRootCount, 16),
    dataverseProfileAuthenticated: health.dataverseProfileAuthenticated === true,
    directGraphAuthentication: false,
  });
}


function localReasonerState(result) {
  const health = result?.providerHealth ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    availability: allowed(health.availability, ["healthy", "configured", "unavailable"], "unavailable"),
    modelCount: boundedCount(health.modelCount, 1000),
    executionEnabled: false,
  });
}

function copilotState(result) {
  const health = result?.providerHealth ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    availability: allowed(health.availability, ["configured", "unavailable"], "unavailable"),
    authentication: allowed(health.authentication, ["unverified", "verified", "unavailable"], "unverified"),
    quota: allowed(health.quota, ["unverified", "available", "exhausted"], "unverified"),
    versionDetected: typeof health.version === "string" && health.version.length > 0,
  });
}

function codexState(result) {
  const health = result?.providerHealth ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    availability: allowed(health.availability, ["healthy", "configured", "unavailable"], "unavailable"),
    invocation: allowed(health.invocation, ["non-interactive-cli", "access-denied", "not-callable"], "not-callable"),
    authentication: allowed(health.authentication, ["unverified", "verified"], "unverified"),
  });
}

function workspaceAgentState(result) {
  const health = result?.providerHealth ?? {};
  return Object.freeze({
    verified: result?.verified === true,
    accessTokenConfigured: health.accessTokenConfigured === true,
    triggerIdConfigured: health.triggerIdConfigured === true,
    platformApiKeyRejected: health.platformApiKeyRejected === true,
    resultTransport: health.resultTransport === "github-secondary-branch" ? "github-secondary-branch" : "unavailable",
  });
}

function allowed(value, values, fallback) { return values.includes(value) ? value : fallback; }
function boundedCount(value, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : 0;
}
