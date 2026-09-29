const MAX_ATTESTATION_MS = 5 * 60_000;
const FUTURE_SKEW_MS = 5_000;
const LEASE_MS = 60_000;
const LOCALITIES = new Set(["cloudflare", "cloud", "local", "desktop"]);
const PERMISSIONS = new Map([["read",1],["write",2],["execute",3],["contained",4]]);
const COST_ORDER = new Map([["deterministic",0],["zero-credit",1],["licensed-cloud",2],["metered-cloud",3]]);
const INTERACTION_MODALITIES = new Set(["text","structured","file","image","audio","video","event"]);
const PROTOCOL_FAMILIES = new Set(["native","http-json","mcp","webhook","sse","websocket","queue"]);
const DEVICE_CLASSES = new Set(["phone","tablet","desktop","embedded","headless"]);
const NETWORK_CLASSES = new Set(["online","degraded","offline"]);
const INTERACTION_CONTEXT_KEYS = new Set(["interactionId","modalities","protocolFamily","locale","deviceClass","networkClass"]);
const INTERACTION_SUPPORT_KEYS = new Set(["modalities","protocolFamilies","locales","maxPayloadBytes"]);

const timeOf = (value) => value instanceof Date ? value.getTime() : new Date(value).getTime();
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
const subset = (wanted, allowed) => wanted.every((item) => allowed.includes(item));

function stableId(prefix, input) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${prefix}-${hash.toString(16).padStart(16, "0")}`;
}

function exactOptionalObject(value, allowedKeys, requiredKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return !keys.some((key) => !allowedKeys.has(key)) && requiredKeys.every((key) => Object.hasOwn(value, key));
}

function validLocale(value, allowWildcard = false) {
  if (allowWildcard && value === "*") return true;
  if (typeof value !== "string" || value.length < 1 || value.length > 64 || value.includes("://")) return false;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}

function validStringSet(value, allowedValues, { allowWildcard = false } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > allowedValues.size + (allowWildcard ? 1 : 0) || new Set(value).size !== value.length) return false;
  return value.every((item) => (allowWildcard && item === "*") || allowedValues.has(item));
}

function validInteractionContext(value) {
  if (value === undefined) return true;
  if (!exactOptionalObject(value, INTERACTION_CONTEXT_KEYS, ["interactionId","modalities","protocolFamily"])) return false;
  if (typeof value.interactionId !== "string" || !/^interaction-[a-f0-9]{32}$/.test(value.interactionId)) return false;
  if (!validStringSet(value.modalities, INTERACTION_MODALITIES)) return false;
  if (!PROTOCOL_FAMILIES.has(value.protocolFamily)) return false;
  if (Object.hasOwn(value, "locale") && !validLocale(value.locale)) return false;
  if (Object.hasOwn(value, "deviceClass") && !DEVICE_CLASSES.has(value.deviceClass)) return false;
  if (Object.hasOwn(value, "networkClass") && !NETWORK_CLASSES.has(value.networkClass)) return false;
  return true;
}

function validInteractionSupport(value) {
  if (value === undefined) return true;
  if (!exactOptionalObject(value, INTERACTION_SUPPORT_KEYS)) return false;
  if (Object.hasOwn(value, "modalities") && !validStringSet(value.modalities, INTERACTION_MODALITIES)) return false;
  if (Object.hasOwn(value, "protocolFamilies") && !validStringSet(value.protocolFamilies, PROTOCOL_FAMILIES)) return false;
  if (Object.hasOwn(value, "locales")) {
    if (!Array.isArray(value.locales) || value.locales.length < 1 || value.locales.length > 32 || new Set(value.locales).size !== value.locales.length || !value.locales.every((item) => validLocale(item, true))) return false;
  }
  if (Object.hasOwn(value, "maxPayloadBytes") && (!Number.isSafeInteger(value.maxPayloadBytes) || value.maxPayloadBytes < 1 || value.maxPayloadBytes > 64 * 1024 * 1024)) return false;
  return true;
}

function interactionCompatible(context, support) {
  if (!validInteractionContext(context) || !validInteractionSupport(support)) return false;
  if (context === undefined || support === undefined) return true;
  if (support.modalities && !context.modalities.every((item) => support.modalities.includes(item))) return false;
  if (support.protocolFamilies && !support.protocolFamilies.includes(context.protocolFamily)) return false;
  if (context.locale && support.locales && !support.locales.includes("*") && !support.locales.includes(context.locale)) return false;
  return true;
}

function malformed(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || value.kind !== "universal-worker-attestation") return true;
  if (typeof value.workerId !== "string" || !value.workerId || typeof value.provider !== "string" || !value.provider) return true;
  if (!LOCALITIES.has(value.locality) || !Array.isArray(value.capabilities) || value.capabilities.length === 0) return true;
  if (!Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) return true;
  if (!validInteractionSupport(value.interactionSupport)) return true;
  return value.capabilities.some((capability) => !capability || typeof capability.capability !== "string" || !PERMISSIONS.has(capability.permissionClass) || typeof capability.healthy !== "boolean" || typeof capability.zeroCreditEligible !== "boolean" || !COST_ORDER.has(capability.costClass) || !isStringArray(capability.dataClassesAllowed) || !isStringArray(capability.authorityScopes));
}
export function validateWorkerAttestation(value, now = new Date()) {
  if (malformed(value)) return { ok:false, reason:"attestation-malformed" };
  const current = timeOf(now);
  const observed = Date.parse(value.observedAt);
  const expires = Date.parse(value.expiresAt);
  if (observed > current + FUTURE_SKEW_MS) return { ok:false, reason:"attestation-future" };
  if (expires <= current) return { ok:false, reason:"attestation-stale" };
  if (expires - observed > MAX_ATTESTATION_MS) return { ok:false, reason:"attestation-overlong" };
  if ((value.observedLatencyMs !== undefined && (!Number.isFinite(value.observedLatencyMs) || value.observedLatencyMs < 0))
    || (value.queueDepth !== undefined && (!Number.isInteger(value.queueDepth) || value.queueDepth < 0))
    || (value.reliabilityScore !== undefined && (!Number.isFinite(value.reliabilityScore) || value.reliabilityScore < 0 || value.reliabilityScore > 1))) {
    return { ok:false, reason:"attestation-metrics-invalid" };
  }
  return { ok:true, attestation:value };
}

function permissionSufficient(advertised, requested) {
  if (requested === "contained" || advertised === "contained") return advertised === requested;
  return (PERMISSIONS.get(advertised) ?? 0) >= (PERMISSIONS.get(requested) ?? 99);
}

function permissionWithinAuthority(authority, requested) {
  if (authority === "contained") return PERMISSIONS.has(requested);
  if (requested === "contained") return false;
  return (PERMISSIONS.get(authority) ?? 0) >= (PERMISSIONS.get(requested) ?? 99);
}

function localityEligible(dataClass, locality) {
  return dataClass !== "local-only" || locality === "local" || locality === "desktop";
}

function routeFrom(attestation, capability) {
  return {
    workerId: attestation.workerId,
    provider: attestation.provider,
    locality: attestation.locality,
    observedAt: attestation.observedAt,
    expiresAt: attestation.expiresAt,
    observedLatencyMs: Number.isFinite(attestation.observedLatencyMs) ? attestation.observedLatencyMs : Number.MAX_SAFE_INTEGER,
    queueDepth: Number.isFinite(attestation.queueDepth) ? attestation.queueDepth : Number.MAX_SAFE_INTEGER,
    reliabilityScore: Number.isFinite(attestation.reliabilityScore) ? attestation.reliabilityScore : 0,
    ...(attestation.interactionSupport === undefined ? {} : { interactionSupport:attestation.interactionSupport }),
    ...capability,
  };
}
export function eligibleWorkerRoutes(request, attestations, now = new Date()) {
  if (!request || typeof request !== "object" || !Array.isArray(attestations) || !validInteractionContext(request.interactionContext)) return [];
  const counts = new Map();
  for (const item of attestations) {
    const key = item && typeof item === "object" ? `${item.provider ?? ""}/${item.workerId ?? ""}` : "invalid";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const routes = [];
  for (const item of attestations) {
    const validation = validateWorkerAttestation(item, now);
    if (!validation.ok || counts.get(`${item.provider}/${item.workerId}`) !== 1) continue;
    if (!localityEligible(request.dataClass, item.locality)) continue;
    if (!interactionCompatible(request.interactionContext, item.interactionSupport)) continue;
    for (const capability of item.capabilities) {
      if (capability.capability !== request.requiredCapability || !capability.healthy) continue;
      if (!permissionSufficient(capability.permissionClass, request.requestedPermission)) continue;
      if (!capability.dataClassesAllowed.includes(request.dataClass)) continue;
      if (!subset(capability.authorityScopes, request.authorityScopes ?? [])) continue;
      if (request.constraints?.requireZeroCredit === true && !capability.zeroCreditEligible) continue;
      routes.push(routeFrom(item, capability));
    }
  }
  return routes;
}

function rankTuple(request, route) {
  const cost = request.costPreference === "zero-credit-first" ? (route.zeroCreditEligible ? 0 : 10 + (COST_ORDER.get(route.costClass) ?? 9)) : (COST_ORDER.get(route.costClass) ?? 9);
  const locality = request.dataClass === "local-only" ? (route.locality === "local" ? 0 : 1) : (route.locality === "cloudflare" ? 0 : route.locality === "cloud" ? 1 : 2);
  return [cost, locality, route.observedLatencyMs, -route.reliabilityScore, route.queueDepth, `${route.provider}/${route.workerId}`];
}

function compareTuple(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function selectWorkerRoute(request, attestations, now = new Date()) {
  const current = timeOf(now);
  if (request?.deadlineAt) {
    const deadline = Date.parse(request.deadlineAt);
    if (!Number.isFinite(deadline)) return { ok:false, reason:"execution-deadline-invalid", eligible:[] };
    if (deadline <= current) return { ok:false, reason:"execution-deadline-exceeded", eligible:[] };
  }
  const eligible = eligibleWorkerRoutes(request, attestations, now);
  if (eligible.length === 0) return { ok:false, reason:"no-eligible-route", eligible:[] };
  eligible.sort((a, b) => compareTuple(rankTuple(request, a), rankTuple(request, b)));
  return { ok:true, selected:eligible[0], eligible };
}
export function issueRouteLease(request, selected, now = new Date()) {
  const start = timeOf(now);
  const deadline = request.deadlineAt ? Date.parse(request.deadlineAt) : Number.POSITIVE_INFINITY;
  const providerExpiry = selected.expiresAt ? Date.parse(selected.expiresAt) : Number.POSITIVE_INFINITY;
  const expiresAtMs = Math.min(start + LEASE_MS, deadline, providerExpiry);
  const seed = `${request.taskId}|${request.chainId}|${selected.provider}|${selected.workerId}|${selected.capability}|${expiresAtMs}`;
  return {
    schemaVersion:1,
    kind:"universal-route-lease",
    routeLeaseId:stableId("lease", seed),
    selectionReceiptId:stableId("sel", seed),
    taskId:request.taskId,
    chainId:request.chainId,
    workerId:selected.workerId,
    provider:selected.provider,
    capability:selected.capability,
    permissionClass:request.requestedPermission,
    authorityScopes:[...(selected.authorityScopes ?? []).filter((scope) => (request.authorityScopes ?? []).includes(scope))],
    expiresAt:new Date(expiresAtMs).toISOString(),
  };
}

export function validateHandoff(request, handoff, history = [], now = new Date()) {
  if (!handoff || handoff.schemaVersion !== 1 || handoff.taskId !== request.taskId || handoff.chainId !== request.chainId) return { ok:false, reason:"handoff-invalid" };
  const current = timeOf(now);
  if (request.deadlineAt && Date.parse(request.deadlineAt) <= current) return { ok:false, reason:"execution-deadline-exceeded" };
  if (!Number.isInteger(handoff.hopCount) || handoff.hopCount >= request.maxHops) return { ok:false, reason:"handoff-hop-limit" };
  const authorityPermission = request.authorityPermission ?? request.requestedPermission;
  if (!permissionWithinAuthority(authorityPermission, handoff.requestedPermission)) return { ok:false, reason:"authority-scope-mismatch" };
  if (!subset(handoff.authorityScopes ?? [], request.authorityScopes ?? [])) return { ok:false, reason:"authority-scope-mismatch" };
  if (history.some((entry) => entry.workerId === handoff.fromWorkerId && entry.capability === handoff.requiredNextCapability)) return { ok:false, reason:"handoff-loop-detected" };
  if (handoff.errorFingerprint && history.filter((entry) => entry.errorFingerprint === handoff.errorFingerprint).length >= 2) return { ok:false, reason:"handoff-loop-detected" };
  const nextRequest = {
    ...request,
    requiredCapability:handoff.requiredNextCapability,
    requestedPermission:handoff.requestedPermission,
    authorityScopes:[...(handoff.authorityScopes ?? [])],
    evidenceRefs:[...(handoff.evidenceRefs ?? [])],
  };
  return { ok:true, handoff, request:nextRequest };
}