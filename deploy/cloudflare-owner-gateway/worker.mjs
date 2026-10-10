import { renderCloudflareBridgeFrame as bridgeFrame } from "./bridge-frame.ts";

import { configuredWorkspaceOrigins } from "./workspace-origins.ts";
import { admissionRenewer, performInlineAdmissionRenewal } from "./admission-renewal.ts";
import { SSE_HEADERS, capabilityEventStream } from "./capability-events.ts";
const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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
  const deterministic = value.capability === "cognitive.predict" || value.capability === "cognitive.cycle";
  const executionPermissions = {
    "repository.inspect":"read", "repository.write":"write", "repository.verify":"read",
    "cloud.inspect":"read", "cloud.execute":"execute",
    "integration.inspect":"read", "integration.execute":"execute",
    "browser.inspect":"read", "browser.execute":"execute",
    "desktop.inspect":"read", "desktop.execute":"execute",
    "codex.inspect":"read", "codex.execute":"contained",
    "memory.read":"read", "memory.write":"write",
    "artifact.inspect":"read", "artifact.write":"write",
    "image.generate":"execute", "workspace-agent.trigger":"execute", "self.evolve":"contained",
  };
  const execution = Object.hasOwn(executionPermissions, value.capability);
  if (value.capability !== "assistant.respond" && !deterministic && !execution) return null;
  if (typeof value.routable !== "boolean" || typeof value.enabled !== "boolean" || value.routable !== value.enabled) return null;
  if (typeof value.provider !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(value.provider)) return null;
  if (value.evidenceLevel !== (deterministic || execution ? "runtime-execution" : "runtime-probe")) return null;
  if (deterministic && (value.costClass !== "deterministic" || value.provider !== "mahoraga-cognitive-core" || !value.routable)) return null;
  if (execution && value.permissionClass !== executionPermissions[value.capability]) return null;
  if (execution && !["deterministic","zero-credit","licensed-cloud","metered-cloud"].includes(value.costClass)) return null;
  const workerIds = execution
    ? (Array.isArray(value.workerIds) ? value.workerIds.filter((id) => typeof id === "string" && /^[a-z0-9._-]{1,120}$/i.test(id)) : [])
    : deterministic ? ["cognitive-core"] : [];
  if (execution && value.routable && workerIds.length === 0) return null;
  const routingReason = value.routingReason === null ? null : value.routingReason;
  const providerReasonCode = value.providerReasonCode === null ? null : value.providerReasonCode;
  if (routingReason !== null && (typeof routingReason !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(routingReason))) return null;
  if (providerReasonCode !== null && (typeof providerReasonCode !== "string" || !/^[a-z0-9._-]{1,80}$/i.test(providerReasonCode))) return null;
  if (value.routable && (routingReason !== null || providerReasonCode !== null)) return null;
  if (!value.routable && routingReason === null) return null;
  return {
    capability:value.capability, routable:value.routable, enabled:value.enabled, provider:value.provider, workerIds,
    // Inspection visibility is a sanitized hint; the broker still authorizes every action.
    ...(value.capability === "cloud.inspect" ? {
      workerId: value.workerId === "cloudflare-readonly-inspector" && workerIds.includes(value.workerId) ? value.workerId : null,
      lastObservedAt: typeof value.lastObservedAt === "string" && Number.isFinite(Date.parse(value.lastObservedAt))
        && Date.parse(value.lastObservedAt) >= Date.now() - 30_000
        && Date.parse(value.lastObservedAt) <= Date.now() + 5_000 ? value.lastObservedAt : null,
    } : {}),
    ...(deterministic ? { costClass:"deterministic" } : execution ? { costClass:value.costClass, permissionClass:value.permissionClass } : {}),
    routingReason, providerReasonCode,
    evidenceLevel: deterministic || execution ? "runtime-execution" : "runtime-probe",
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
    const projected = body.capabilities.map(boundedCapability).filter(Boolean);
    const assistant = projected.find((entry) => entry.capability === "assistant.respond");
    return { capabilities: [assistant ?? pendingAssistantCapability("execution-runtime-evidence-invalid"), ...projected.filter((entry) => entry.capability !== "assistant.respond")] };
  } catch {
    return { capabilities: [pendingAssistantCapability("execution-runtime-unavailable")] };
  }
}

const INTERACTION_TRUTH_KEYS = new Set([
  "status", "interactionId", "sourceFamily", "channelFamily", "modalities", "protocolFamily", "protocolVersion",
  "locale", "timezone", "direction", "unitSystem", "currency", "deviceClass", "networkClass", "executionStatus",
  "interactionFingerprint", "negotiationFingerprint", "executionFingerprint", "observedAt", "reason",
]);
const DELIVERY_TRUTH_KEYS = new Set(["status", "interactionId", "taskId", "chainId", "outputReferences", "deliveryFingerprint", "observedAt", "reason"]);
const INTERACTION_TRUTH_WRAPPER_KEYS = new Set(["interactionTruth", "deliveryTruth", "runtimeTruthFingerprint"]);
const INTERACTION_MODALITIES = new Set(["text", "structured", "file", "image", "audio", "video", "event"]);
const INTERACTION_PROTOCOLS = new Set(["native", "http-json", "mcp", "webhook", "sse", "websocket", "queue"]);
const INTERACTION_DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
const INTERACTION_UNITS = new Set(["metric", "us", "uk"]);
const INTERACTION_DEVICES = new Set(["phone", "tablet", "desktop", "embedded", "headless"]);
const INTERACTION_NETWORKS = new Set(["online", "degraded", "offline"]);
const INTERACTION_FORBIDDEN_KEYS = new Set(["authority", "actionAuthority", "trafficAuthority", "providerRoute", "route", "credentials", "credential", "headers", "authorization", "token", "secret", "lease", "spendingAuthority", "endpoint", "url"]);
const stableInteractionId = (value, max = 256) => typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) && !value.includes("://");
const optionalStableInteractionId = (value, max = 256) => value === undefined || value === null || stableInteractionId(value, max);
const boundedInteractionText = (value, max = 160) => value === undefined || value === null || (typeof value === "string" && value.length > 0 && value.length <= max);
const isoInteractionTime = (value) => value === undefined || value === null || (typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)));
function onlyInteractionKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key) && !INTERACTION_FORBIDDEN_KEYS.has(key));
}
function validRuntimeInteractionTruth(value) {
  if (!onlyInteractionKeys(value, INTERACTION_TRUTH_KEYS)) return false;
  if (!new Set(["observed", "hold"]).has(value.status) || !stableInteractionId(value.interactionId) || !stableInteractionId(value.sourceFamily) || !stableInteractionId(value.channelFamily)) return false;
  if (!Array.isArray(value.modalities) || value.modalities.length < 1 || value.modalities.length > 7 || new Set(value.modalities).size !== value.modalities.length || !value.modalities.every((item) => INTERACTION_MODALITIES.has(item))) return false;
  if (!INTERACTION_PROTOCOLS.has(value.protocolFamily) || !boundedInteractionText(value.protocolVersion, 32)) return false;
  if (value.locale !== undefined && value.locale !== null) { try { if (Intl.getCanonicalLocales(value.locale).length !== 1) return false; } catch { return false; } }
  if (value.timezone !== undefined && value.timezone !== null) { try { new Intl.DateTimeFormat("en", { timeZone:value.timezone }).format(0); } catch { return false; } }
  if (value.direction !== undefined && value.direction !== null && !INTERACTION_DIRECTIONS.has(value.direction)) return false;
  if (value.unitSystem !== undefined && value.unitSystem !== null && !INTERACTION_UNITS.has(value.unitSystem)) return false;
  if (value.currency !== undefined && value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) return false;
  if (value.deviceClass !== undefined && value.deviceClass !== null && !INTERACTION_DEVICES.has(value.deviceClass)) return false;
  if (value.networkClass !== undefined && value.networkClass !== null && !INTERACTION_NETWORKS.has(value.networkClass)) return false;
  if (!boundedInteractionText(value.executionStatus, 64) || !/^[a-f0-9]{64}$/.test(value.interactionFingerprint)) return false;
  if (value.negotiationFingerprint !== undefined && value.negotiationFingerprint !== null && !/^[a-f0-9]{64}$/.test(value.negotiationFingerprint)) return false;
  if (value.executionFingerprint !== undefined && value.executionFingerprint !== null && !/^[a-f0-9]{64}$/.test(value.executionFingerprint)) return false;
  return isoInteractionTime(value.observedAt) && boundedInteractionText(value.reason, 160);
}
function validRuntimeDeliveryTruth(value) {
  if (!onlyInteractionKeys(value, DELIVERY_TRUTH_KEYS)) return false;
  if (!new Set(["delivered", "queued", "hold"]).has(value.status) || !stableInteractionId(value.interactionId)) return false;
  if (!optionalStableInteractionId(value.taskId) || !optionalStableInteractionId(value.chainId) || ((value.taskId == null) !== (value.chainId == null))) return false;
  if (!Array.isArray(value.outputReferences) || value.outputReferences.length > 32 || new Set(value.outputReferences).size !== value.outputReferences.length || !value.outputReferences.every((item) => stableInteractionId(item, 512))) return false;
  return /^[a-f0-9]{64}$/.test(value.deliveryFingerprint) && isoInteractionTime(value.observedAt) && boundedInteractionText(value.reason, 160);
}
function sanitizeInteractionTruthResult(value) {
  if (!onlyInteractionKeys(value, INTERACTION_TRUTH_WRAPPER_KEYS) || !Object.hasOwn(value, "interactionTruth") || !Object.hasOwn(value, "deliveryTruth")) return null;
  if (!validRuntimeInteractionTruth(value.interactionTruth) || !/^[a-f0-9]{64}$/.test(value.runtimeTruthFingerprint)) return null;
  if (value.deliveryTruth !== null && !validRuntimeDeliveryTruth(value.deliveryTruth)) return null;
  if (value.deliveryTruth !== null && value.deliveryTruth.interactionId !== value.interactionTruth.interactionId) return null;
  return {
    interactionTruth:{ ...value.interactionTruth, modalities:[...value.interactionTruth.modalities] },
    deliveryTruth:value.deliveryTruth === null ? null : { ...value.deliveryTruth, outputReferences:[...value.deliveryTruth.outputReferences] },
    runtimeTruthFingerprint:value.runtimeTruthFingerprint,
  };
}

import { runtimeReadiness } from "./runtime-readiness.ts";

const LAZY_RENEWAL_ACTIONS = new Set(["chat", "execute"]);
/** In-request lazy renewal: dedupes per isolate, never throws, and never blocks beyond its own bounded timeout. */
async function lazyAdmissionRenewal(env) {
  try { return await admissionRenewer.renewIfDue(env, "lazy"); } catch { return null; }
}

const NATIVE_ACTIONS = new Set(["chat", "tasks", "messages", "message-content", "conversations", "conversation-history", "execute", "interaction-truth", "internal-activity", "internal-activity-control", "memory-search", "native-github-workspace", "native-github-repository", "native-github-pull-request", "native-github-merge", "native-github-main-write"]);
async function nativeRuntimeAction(type, payload, env, owner) {
  const binding = env?.MAHORAGA_EXECUTION_RUNTIME;
  if (!binding || typeof binding.fetch !== "function") return json({ error: "cloud-native-capability-unavailable" }, 503);
  if (type === "interaction-truth" && (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1 || typeof payload.interactionId !== "string" || !/^interaction-[a-f0-9]{32}$/.test(payload.interactionId))) {
    return json({ error: "interaction-truth-request-invalid" }, 400);
  }
  const body = JSON.stringify({ type, payload });
  if (new TextEncoder().encode(body).byteLength > 32_768) return json({ error: "cloud-action-too-large" }, 413);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${owner}\n${timestamp}\n${nonce}\n${digest}`))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const response = await binding.fetch(new Request("https://mahoraga-execution-runtime/api/native/bridge", {
      method: "POST", headers: { "content-type": "application/json", "x-mahoraga-owner": owner, "x-mahoraga-owner-timestamp": timestamp, "x-mahoraga-owner-nonce": nonce, "x-mahoraga-owner-signature": signature }, body,
    }));
    const result = await response.json();
    if (type === "interaction-truth") {
      if (!response.ok) {
        const code = result && typeof result === "object" && !Array.isArray(result) && typeof result.error === "string" && /^[a-z0-9.-]{1,80}$/.test(result.error) ? result.error : "execution-runtime-unavailable";
        return json({ error:code }, response.status);
      }
      const sanitized = sanitizeInteractionTruthResult(result);
      return sanitized === null ? json({ error:"execution-runtime-evidence-invalid" }, 503) : json(sanitized, 200);
    }
    return json(result, response.status);
  } catch { return json({ error: "execution-runtime-unavailable" }, 503); }
}

async function nativeBridgeResponse(request, requestUrl, env, owner) {
  if (requestUrl.pathname === "/" && request.method === "GET" && !request.headers.get("accept")?.includes("text/html")) {
    return json({ gateway: "mahoraga-owner-gateway", ownerAuthenticated: true, runtime: "cloudflare-native-migration", state: "degraded" });
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/frame" && request.method === "GET") {
    const workspaceOrigins = configuredWorkspaceOrigins(env);
    if (!workspaceOrigins) return new Response("gateway-pages-origin-invalid", { status: 503 });
    const bridgeParentOrigins = Object.freeze([...new Set([...workspaceOrigins, requestUrl.origin])]);
    return new Response(bridgeFrame(bridgeParentOrigins), { status: 200, headers: {
      "cache-control": "no-store", "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${bridgeParentOrigins.join(" ")}; base-uri 'none'; form-action 'none'`,
      "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    } });
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/action" && request.method === "POST") {
    const value = await request.json().catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "cloud-action-not-allowed" }, 400);
    if (value.type === "readiness") {
      if (Object.keys(value).sort().join(",") !== "payload,type" || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload) || Object.keys(value.payload).length) return json({ error:"cloud-readiness-request-invalid" },400);
      return runtimeReadiness(env?.MAHORAGA_EXECUTION_RUNTIME);
    }
    if (LAZY_RENEWAL_ACTIONS.has(value.type)) await lazyAdmissionRenewal(env);
    if (value.type === "capabilities") return json(await runtimeCapabilities(env));
    if (NATIVE_ACTIONS.has(value.type)) return nativeRuntimeAction(value.type, value.payload, env, owner);
    return json({ error: "cloud-native-capability-unavailable" }, 503);
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/events") {
    if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405);
    return new Response(capabilityEventStream({
      load: () => runtimeCapabilities(env),
      beforeTick: () => lazyAdmissionRenewal(env),
      signal: request.signal,
    }), { status: 200, headers: SSE_HEADERS });
  }
  if (requestUrl.pathname === "/api/runtime/pages-bridge/artifacts") return json({ error: "cloud-native-artifact-unavailable" }, 503);
  if ((request.method === "GET" || request.method === "HEAD") && (!requestUrl.pathname.startsWith("/api/") || requestUrl.pathname === "/api/health.json")) {
    const workspace = env?.MAHORAGA_WORKSPACE;
    if (!workspace || typeof workspace.fetch !== "function") return json({ error: "cloud-workspace-unavailable" }, 503);
    const assetUrl = new URL(requestUrl.pathname + requestUrl.search, "https://mahoraga-workspace-candidate.internal");
    return workspace.fetch(new Request(assetUrl, request));
  }
  return null;
}
export default {
  async fetch(request, env, ctx) {
    const ownerId = typeof env?.MAHORAGA_CLOUD_OWNER_ID === "string" ? env.MAHORAGA_CLOUD_OWNER_ID.trim() : "";
    const assertionSecret = typeof env?.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET === "string" ? env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET : "";
    if (!ownerId || assertionSecret.length < 32) return new Response("gateway-environment-invalid", { status: 503 });
    if (!ctx?.access || typeof ctx.access.getIdentity !== "function") return new Response("owner-access-required", { status: 403 });
    let identity;
    try { identity = await ctx.access.getIdentity(); } catch { return new Response("owner-access-required", { status: 403 }); }
    const owner = typeof identity?.email === "string" ? identity.email.trim() : "";
    if (!owner || owner !== ownerId) return new Response("owner-auth-required", { status: 401 });
    const requestUrl = new URL(request.url);
    const safeMethod = new Set(["GET", "HEAD", "OPTIONS"]).has(request.method.toUpperCase());
    if (!safeMethod) {
      let callerOrigin;
      try { callerOrigin = new URL(request.headers.get("origin") ?? "").origin; } catch { return new Response("gateway-same-origin-required", { status: 403 }); }
      if (callerOrigin !== requestUrl.origin) return new Response("gateway-same-origin-required", { status: 403 });
    }
    const native = await nativeBridgeResponse(request, requestUrl, env, owner);
    if (native) return native;
    return json({ error: "cloud-native-route-required" }, 404);
  },
  /** Cloudflare cron trigger (every minute): background admission renewal independent of GitHub Actions. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(performInlineAdmissionRenewal(env, "scheduled"));
  },
};
