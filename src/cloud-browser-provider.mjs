const TARGETS = Object.freeze({
  "public.youtube": Object.freeze({ url: "https://www.youtube.com/", host: "www.youtube.com" }),
});

export async function executeCloudBrowserNavigation({ task, invoke, env = process.env } = {}) {
  const target = TARGETS[task?.targetId];
  if (!target) return unavailable("cloud-browser-target-not-registered");
  if (task?.attendedAuthority !== true) return unavailable("cloud-browser-attended-authority-required");
  const credential = typeof env?.BROWSERBASE_API_KEY === "string" ? env.BROWSERBASE_API_KEY.trim() : "";
  if (!credential) return unavailable("cloud-browser-credential-unavailable");
  if (typeof invoke !== "function") return unavailable("cloud-browser-provider-binding-unavailable");
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
  return {
    verified: true,
    summary: `Cloud browser completed the registered ${task.targetId} target.`,
    targetId: task.targetId,
    targetHost: target.host,
    providerHealth: {
      availability: "healthy",
      provider: "browserbase",
      executionMode: "core-routed-isolated-cloud",
      attendedAuthority: true,
      isolated: true,
      extensionsEnabled: false,
      localFileAccess: false,
    },
  };
}

function unavailable(reasonCode) {
  return {
    verified: false,
    summary: `Cloud browser unavailable: ${reasonCode}.`,
    providerHealth: {
      availability: "unavailable",
      provider: "browserbase",
      executionMode: "core-routed-isolated-cloud",
      attendedAuthority: false,
      isolated: true,
      extensionsEnabled: false,
      localFileAccess: false,
      reasonCode,
    },
  };
}
