const TARGETS = Object.freeze({
  "public.youtube": Object.freeze({ url: "https://www.youtube.com/", host: "www.youtube.com" }),
});
const SESSIONS_URL = "https://api.browserbase.com/v1/sessions";

export async function probeCloudBrowserProvider({ env = process.env } = {}) {
  const credential = readCredential(env);
  if (!credential) return unavailable("cloud-browser-credential-unavailable");
  return {
    verified: true,
    summary: "Isolated cloud browser is bound to registered public.youtube navigation.",
    providerHealth: health("healthy", { attendedAuthority: false }),
  };
}

export async function executeCloudBrowserNavigation({ task, invoke, fetchImpl = fetch, env = process.env } = {}) {
  const target = TARGETS[task?.targetId];
  if (!target) return unavailable("cloud-browser-target-not-registered");
  if (task?.attendedAuthority !== true) return unavailable("cloud-browser-attended-authority-required");
  const credential = readCredential(env);
  if (!credential) return unavailable("cloud-browser-credential-unavailable");

  if (typeof invoke === "function") {
    let providerResult;
    try {
      providerResult = await invoke({
        targetId: task.targetId,
        targetUrl: target.url,
        credential,
        isolated: true,
        extensionsEnabled: false,
        localFileAccess: false,
      });
    } catch {
      return unavailable("cloud-browser-provider-failed");
    }
    if (!providerResult || providerResult.status !== "completed") return unavailable("cloud-browser-provider-unverified");
    return completed(task.targetId, target.host);
  }

  const headers = {
    "x-bb-api-key": credential,
    "content-type": "application/json",
  };
  let sessionId;
  try {
    const created = await fetchImpl(SESSIONS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        browserSettings: { solveCaptchas: false },
        keepAlive: false,
      }),
    });
    if (!created?.ok) return unavailable(`cloud-browser-session-http-${boundedStatus(created?.status)}`);
    const session = await created.json();
    sessionId = typeof session?.id === "string" ? session.id : "";
    if (!sessionId) return unavailable("cloud-browser-session-invalid");

    const navigated = await fetchImpl(`${SESSIONS_URL}/${sessionId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: target.url }),
    });
    if (!navigated?.ok) return unavailable(`cloud-browser-navigate-http-${boundedStatus(navigated?.status)}`);
  } catch {
    return unavailable("cloud-browser-provider-failed");
  } finally {
    if (sessionId) {
      try {
        await fetchImpl(`${SESSIONS_URL}/${sessionId}`, { method: "DELETE", headers });
      } catch {
        // Session cleanup is best-effort; the receipt remains fail-closed on navigation result.
      }
    }
  }
  return completed(task.targetId, target.host);
}

function completed(targetId, targetHost) {
  return {
    verified: true,
    summary: `Cloud browser completed the registered ${targetId} target.`,
    targetId,
    targetHost,
    providerHealth: health("healthy", { attendedAuthority: true }),
  };
}

function readCredential(env) {
  return typeof env?.BROWSERBASE_API_KEY === "string" ? env.BROWSERBASE_API_KEY.trim() : "";
}

function health(availability, extra = {}) {
  const value = {
    availability,
    provider: "browserbase",
    executionMode: "core-routed-isolated-cloud",
    attendedAuthority: extra.attendedAuthority === true,
    isolated: true,
    extensionsEnabled: false,
    localFileAccess: false,
  };
  if (extra.reasonCode) value.reasonCode = extra.reasonCode;
  return value;
}

function unavailable(reasonCode) {
  return {
    verified: false,
    summary: `Cloud browser unavailable: ${reasonCode}.`,
    providerHealth: health("unavailable", { attendedAuthority: false, reasonCode }),
  };
}

function boundedStatus(value) { return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0; }
