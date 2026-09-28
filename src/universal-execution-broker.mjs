const MAX_ATTESTATION_MS = 5 * 60_000;
const FUTURE_SKEW_MS = 5_000;
const LEASE_MS = 60_000;
const LOCALITIES = new Set(["cloudflare", "cloud", "local", "desktop"]);
const PERMISSIONS = new Map([["read",1],["write",2],["execute",3],["contained",4]]);
const COST_ORDER = new Map([["deterministic",0],["zero-credit",1],["licensed-cloud",2],["metered-cloud",3]]);

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

function malformed(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || value.kind !== "universal-worker-attestation") return true;
  if (typeof value.workerId !== "string" || !value.workerId || typeof value.provider !== "string" || !value.provider) return true;
  if (!LOCALITIES.has(value.locality) || !Array.isArray(value.capabilities) || value.capabilities.length === 0) return true;
  if (!Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) return true;
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
  return { ok:true, attestation:value };
}

function permissionSufficient(advertised, requested) {
  if (requested === "contained" || advertised === "contained") return advertised === requested;
  return (PERMISSIONS.get(advertised) ?? 0) >= (PERMISSIONS.get(requested) ?? 99);
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
    ...capability,
  };
}
export function eligibleWorkerRoutes(request, attestations, now = new Date()) {
  if (!request || typeof request !== "object" || !Array.isArray(attestations)) return [];
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
    for (const capability of item.capabilities) {
      if (capability.capability !== request.requiredCapability || !capability.healthy) continue;
      if (!permissionSufficient(capability.permissionClass, request.requestedPermission)) continue;
      if (!capability.dataClassesAllowed.includes(request.dataClass)) continue;
      if (!subset(request.authorityScopes ?? [], capability.authorityScopes)) continue;
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
    permissionClass:selected.permissionClass,
    authorityScopes:[...(request.authorityScopes ?? [])],
    expiresAt:new Date(expiresAtMs).toISOString(),
  };
}

export function validateHandoff(request, handoff, history = [], now = new Date()) {
  if (!handoff || handoff.schemaVersion !== 1 || handoff.taskId !== request.taskId || handoff.chainId !== request.chainId) return { ok:false, reason:"handoff-invalid" };
  const current = timeOf(now);
  if (request.deadlineAt && Date.parse(request.deadlineAt) <= current) return { ok:false, reason:"execution-deadline-exceeded" };
  if (!Number.isInteger(handoff.hopCount) || handoff.hopCount >= request.maxHops) return { ok:false, reason:"handoff-hop-limit" };
  if (!permissionSufficient(request.requestedPermission, handoff.requestedPermission)) return { ok:false, reason:"authority-scope-mismatch" };
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