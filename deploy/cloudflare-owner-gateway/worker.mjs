const DEFAULT_PAGES_ORIGIN = "https://michaeljwilliams0123.github.io";
const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function configuredPagesOrigin(env) {
  const value = typeof env?.MAHORAGA_PAGES_ORIGIN === "string" && env.MAHORAGA_PAGES_ORIGIN.trim()
    ? env.MAHORAGA_PAGES_ORIGIN.trim()
    : DEFAULT_PAGES_ORIGIN;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

function bridgeFrame(pagesOrigin) {
  const encodedOrigin = JSON.stringify(pagesOrigin).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mahoraga bridge</title></head><body><script>
(() => {
  "use strict";
  const PAGES_ORIGIN = ${encodedOrigin};
  const PROTOCOL_VERSION = 1;
  function reply(requestId, ok, result, error) {
    const value = { protocolVersion: PROTOCOL_VERSION, requestId, ok };
    if (ok && result !== undefined) value.result = result;
    if (!ok && error) value.error = error;
    window.parent.postMessage(value, PAGES_ORIGIN);
  }
  async function action(request) {
    const response = await fetch("/api/runtime/pages-bridge/action", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: request.action, payload: request.payload }),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "cloud-gateway-unavailable");
    return value;
  }
  window.addEventListener("message", async (event) => {
    if (event.origin !== PAGES_ORIGIN || event.source !== window.parent) return;
    const request = event.data;
    if (!request || request.protocolVersion !== PROTOCOL_VERSION || typeof request.requestId !== "string" || typeof request.type !== "string") return;
    try {
      if (request.type === "bridge.status") { reply(request.requestId, true, { authenticated: true }); return; }
      if (request.type === "bridge.disconnect") { reply(request.requestId, true, { authenticated: false }); return; }
      if (request.type === "bridge.login") { reply(request.requestId, true, { authenticated: true }); return; }
      if (request.type === "bridge.action") { reply(request.requestId, true, await action(request)); return; }
      if (request.type === "bridge.artifact") { throw new Error("cloud-native-artifact-unavailable"); }
    } catch (caught) {
      const code = caught instanceof Error && /^[a-z0-9.-]+$/.test(caught.message) ? caught.message : "cloud-gateway-unavailable";
      reply(request.requestId, false, undefined, code);
    }
  });
})();
</script></body></html>`;
}

function pendingAssistantCapability(reasonCode = "cloudflare-native-provider-pending") {
  return {
    capability: "assistant.respond",
    routable: false,
    enabled: false,
    provider: "cloudflare-native",
    workerIds: [],
    routingReason: "provider.gap",
    providerReasonCode: reasonCode,
    evidenceLevel: "runtime-probe",
  };
}

function boundedCapability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.capability !== "assistant.respond" || typeof value.routable !== "boolean" || typeof value.enabled !== "boolean") return null;
  if (value.routable !== value.enabled) return null;
  if (typeof value.provider !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(value.provider)) return null;
  if (value.evidenceLevel !== "runtime-probe") return null;
  const routingReason = value.routingReason === null ? null : value.routingReason;
  const providerReasonCode = value.providerReasonCode === null ? null : value.providerReasonCode;
  if (routingReason !== null && (typeof routingReason !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(routingReason))) return null;
  if (providerReasonCode !== null && (typeof providerReasonCode !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(providerReasonCode))) return null;
  if (value.routable && (routingReason !== null || providerReasonCode !== null)) return null;
  if (!value.routable && routingReason === null) return null;
  return {
    capability: "assistant.respond",
    routable: value.routable,
    enabled: value.enabled,
    provider: value.provider,
    workerIds: [],
    routingReason,
    providerReasonCode,
    evidenceLevel: "runtime-probe",
  };
}

async function runtimeCapabilities(env) {
  const binding = env?.MAHORAGA_EXECUTION_RUNTIME;
  if (!binding || typeof binding.fetch !== "function") {
    return { capabilities: [pendingAssistantCapability()] };
  }
  try {
    const response = await binding.fetch(new Request("https://mahoraga-execution-runtime/api/capabilities", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    if (!response.ok) return { capabilities: [pendingAssistantCapability("execution-runtime-unavailable")] };
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.capabilities)) {
      return { capabilities: [pendingAssistantCapability("execution-runtime-evidence-invalid")] };
    }
    const capability = boundedCapability(body.capabilities.find((entry) => entry?.capability === "assistant.respond"));
    return { capabilities: [capability ?? pendingAssistantCapability("execution-runtime-evidence-invalid")] };
  } catch {
    return { capabilities: [pendingAssistantCapability("execution-runtime-unavailable")] };
  }
}

async function nativeBridgeResponse(request, requestUrl, env) {
  if (requestUrl.pathname === "/" && request.method === "GET") {
    return json({
      gateway: "mahoraga-owner-gateway",
      ownerAuthenticated: true,
      runtime: "cloudflare-native-migration",
      state: "degraded",
    });
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/frame" && request.method === "GET") {
    const pagesOrigin = configuredPagesOrigin(env);
    if (!pagesOrigin) return new Response("gateway-pages-origin-invalid", { status: 503 });
    return new Response(bridgeFrame(pagesOrigin), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${pagesOrigin}; base-uri 'none'; form-action 'none'`,
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/action" && request.method === "POST") {
    const value = await request.json().catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "cloud-action-not-allowed" }, 400);
    if (value.type === "capabilities") return json(await runtimeCapabilities(env));
    return json({ error: "cloud-native-capability-unavailable" }, 503);
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/artifacts") return json({ error: "cloud-native-artifact-unavailable" }, 503);
  return null;
}
export default {
  async fetch(request, env, ctx) {
    const ownerId = typeof env?.MAHORAGA_CLOUD_OWNER_ID === "string" ? env.MAHORAGA_CLOUD_OWNER_ID.trim() : "";
    const assertionSecret = typeof env?.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET === "string" ? env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET : "";
    if (!ownerId || assertionSecret.length < 32) return new Response("gateway-environment-invalid", { status: 503 });
    if (!ctx?.access || typeof ctx.access.getIdentity !== "function") return new Response("owner-access-required", { status: 403 });

    let identity;
    try { identity = await ctx.access.getIdentity(); }
    catch { return new Response("owner-access-required", { status: 403 }); }
    const owner = typeof identity?.email === "string" ? identity.email.trim() : "";
    if (!owner || owner !== ownerId) return new Response("owner-auth-required", { status: 401 });

    const requestUrl = new URL(request.url);
    const safeMethod = new Set(["GET", "HEAD", "OPTIONS"]).has(request.method.toUpperCase());
    if (!safeMethod) {
      let callerOrigin;
      try { callerOrigin = new URL(request.headers.get("origin") ?? "").origin; }
      catch { return new Response("gateway-same-origin-required", { status: 403 }); }
      if (callerOrigin !== requestUrl.origin) return new Response("gateway-same-origin-required", { status: 403 });
    }

    const native = await nativeBridgeResponse(request, requestUrl, env);
    if (native) return native;

    let origin;
    try { origin = new URL(env.MAHORAGA_RUNTIME_ORIGIN); }
    catch { return new Response("gateway-origin-invalid", { status: 503 }); }
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      return new Response("gateway-origin-invalid", { status: 503 });
    }
    const target = new URL(requestUrl);
    target.protocol = origin.protocol;
    target.host = origin.host;
    if (target.origin === requestUrl.origin) return new Response("gateway-origin-invalid", { status: 503 });

    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const assertion = `${owner}\n${timestamp}\n${nonce}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(assertionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(assertion)));
    const signature = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const headers = new Headers(request.headers);
    for (const name of ["x-mahoraga-owner", "x-mahoraga-owner-timestamp", "x-mahoraga-owner-nonce", "x-mahoraga-owner-signature"]) headers.delete(name);
    headers.set("x-mahoraga-owner", owner);
    headers.set("x-mahoraga-owner-timestamp", String(timestamp));
    headers.set("x-mahoraga-owner-nonce", nonce);
    headers.set("x-mahoraga-owner-signature", signature);
    if (!safeMethod) headers.set("origin", origin.origin);
    return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
  },
};
