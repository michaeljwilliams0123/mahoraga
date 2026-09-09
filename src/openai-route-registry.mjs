import { readFile } from "node:fs/promises";
import { fingerprintPublicKeySpki, verifySignedPayloadEnvelope } from "./destiny-trigger-trust.mjs";

export const OPENAI_ROUTE_REGISTRY_PATH = new URL("../config/openai-route-registry.json", import.meta.url);
export const OPENAI_ROUTE_REGISTRY_SCHEMA_VERSION = 1;

const REGISTRY_KEYS = new Set(["schemaVersion", "kind", "repository", "transport", "routes"]);
const TRANSPORT_KEYS = new Set(["githubAppSlug", "githubAppId"]);
const ROUTE_KEYS = new Set([
  "routeId", "workerId", "label", "executorLane", "receiptTrustMode", "bindingState", "publicTrust", "capabilities",
  "dataClasses", "costClass", "executionPlane", "interfaceType", "permissionClass", "reliability", "latencyMs",
  "maximumWorkload", "requiresAttendedDesktop", "economicTier",
]);
const PUBLIC_TRUST_KEYS = new Set(["algorithm", "publicKeyFingerprint", "keyId"]);
const STATUS_KEYS = new Set([
  "routeId", "bindingState", "ready", "reason", "observedAt", "zeroCreditEligible", "exactHeadMatch", "availability",
  "workload", "transport",
]);
const PRIVATE_BINDING_KEYS = new Set([
  "schemaVersion", "kind", "routeId", "repository", "codexAccountFingerprint", "codexInstallationFingerprint",
  "codexEnvironmentFingerprint", "receiptKeyFingerprint", "boundAt",
]);
const RESULT_KEYS = new Set([
  "schemaVersion", "kind", "routeId", "repository", "sourceTaskId", "taskDigest", "baseSha", "candidateHeadSha",
  "codexAccountFingerprint", "codexInstallationFingerprint", "codexEnvironmentFingerprint", "receiptKeyFingerprint", "status",
  "observedAt", "actorLogin", "publicKeyFingerprint", "publicKeySpki", "signature",
]);
const BINDING_STATES = new Set(["unconfigured", "paired"]);
const RECEIPT_TRUST_MODES = new Set(["signed-receipt"]);
const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const COST_CLASSES = new Set(["deterministic", "local-model", "licensed-cloud", "metered-cloud", "cloud-open-weight"]);
const AVAILABILITY = new Set(["healthy", "busy", "starting", "configured", "disabled", "stale", "offline", "unhealthy", "unavailable"]);

export async function loadOpenAiRouteRegistry(file = OPENAI_ROUTE_REGISTRY_PATH) {
  return validateOpenAiRouteRegistry(JSON.parse(await readFile(file, "utf8")));
}

export function validateOpenAiRouteRegistry(value) {
  exact(value, REGISTRY_KEYS, "openai-route-registry-invalid");
  if (value.schemaVersion !== OPENAI_ROUTE_REGISTRY_SCHEMA_VERSION || value.kind !== "openai-route-registry") fail("openai-route-registry-invalid");
  const transport = validateTransport(value.transport);
  const repository = repositoryName(value.repository, "openai-route-registry-invalid");
  if (!Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 16) fail("openai-route-registry-invalid");
  const routes = value.routes.map((route) => validateRoute(route, repository)).sort((left, right) => left.routeId.localeCompare(right.routeId));
  if (new Set(routes.map((route) => route.routeId)).size !== routes.length) fail("openai-route-registry-route-duplicate");
  return deepFreeze({ schemaVersion: 1, kind: "openai-route-registry", repository, transport, routes });
}

export function validateOpenAiRouteStatus(value) {
  exact(value, STATUS_KEYS, "openai-route-status-invalid");
  const normalizedRouteId = routeId(value.routeId, "openai-route-status-invalid");
  const bindingState = allowed(value.bindingState, BINDING_STATES, "openai-route-status-invalid");
  if (typeof value.ready !== "boolean") fail("openai-route-status-invalid");
  const reason = value.ready ? null : token(value.reason, 96, "openai-route-status-invalid");
  if (value.ready && value.reason !== null) fail("openai-route-status-invalid");
  return deepFreeze({
    routeId: normalizedRouteId,
    bindingState,
    ready: value.ready,
    reason,
    observedAt: timestamp(value.observedAt, "openai-route-status-invalid"),
    zeroCreditEligible: value.zeroCreditEligible === true,
    exactHeadMatch: value.exactHeadMatch === true,
    availability: allowed(value.availability, AVAILABILITY, "openai-route-status-invalid"),
    workload: integer(value.workload, 0, 1024, "openai-route-status-invalid"),
    transport: value.transport === null ? null : validateTransportObservation(value.transport),
  });
}

export function validateOpenAiPrivateRouteBinding(value) {
  exact(value, PRIVATE_BINDING_KEYS, "openai-route-private-binding-invalid");
  if (value.schemaVersion !== 1 || value.kind !== "openai-private-route-binding") fail("openai-route-private-binding-invalid");
  return deepFreeze({
    schemaVersion: 1,
    kind: "openai-private-route-binding",
    routeId: routeId(value.routeId, "openai-route-private-binding-invalid"),
    repository: repositoryName(value.repository, "openai-route-private-binding-invalid"),
    codexAccountFingerprint: sha64(value.codexAccountFingerprint, "openai-route-private-binding-invalid"),
    codexInstallationFingerprint: sha64(value.codexInstallationFingerprint, "openai-route-private-binding-invalid"),
    codexEnvironmentFingerprint: sha64(value.codexEnvironmentFingerprint, "openai-route-private-binding-invalid"),
    receiptKeyFingerprint: sha64(value.receiptKeyFingerprint, "openai-route-private-binding-invalid"),
    boundAt: timestamp(value.boundAt, "openai-route-private-binding-invalid"),
  });
}

export function validateOpenAiRouteResult(value) {
  exact(value, RESULT_KEYS, "openai-route-result-invalid");
  if (value.schemaVersion !== 1 || value.kind !== "openai-route-result") fail("openai-route-result-invalid");
  return deepFreeze({
    schemaVersion: 1,
    kind: "openai-route-result",
    routeId: routeId(value.routeId, "openai-route-result-invalid"),
    repository: repositoryName(value.repository, "openai-route-result-invalid"),
    sourceTaskId: opaque(value.sourceTaskId, 128, "openai-route-result-invalid"),
    taskDigest: sha64(value.taskDigest, "openai-route-result-invalid"),
    baseSha: sha40(value.baseSha, "openai-route-result-invalid"),
    candidateHeadSha: value.candidateHeadSha === null ? null : sha40(value.candidateHeadSha, "openai-route-result-invalid"),
    codexAccountFingerprint: sha64(value.codexAccountFingerprint, "openai-route-result-invalid"),
    codexInstallationFingerprint: sha64(value.codexInstallationFingerprint, "openai-route-result-invalid"),
    codexEnvironmentFingerprint: sha64(value.codexEnvironmentFingerprint, "openai-route-result-invalid"),
    receiptKeyFingerprint: sha64(value.receiptKeyFingerprint, "openai-route-result-invalid"),
    status: token(value.status, 32, "openai-route-result-invalid"),
    observedAt: timestamp(value.observedAt, "openai-route-result-invalid"),
    actorLogin: token(value.actorLogin, 64, "openai-route-result-invalid"),
    publicKeyFingerprint: sha64(value.publicKeyFingerprint, "openai-route-result-invalid"),
    publicKeySpki: spki(value.publicKeySpki),
    signature: signature(value.signature),
  });
}

export function projectOpenAiCapabilityRoutes({ registry, routeStatuses = [], observedAt = new Date().toISOString() } = {}) {
  const validatedRegistry = validateOpenAiRouteRegistry(registry);
  const seen = new Set();
  const byRoute = new Map(routeStatuses.map((item) => {
    const status = validateOpenAiRouteStatus(item);
    if (seen.has(status.routeId)) fail("openai-route-status-duplicate");
    seen.add(status.routeId);
    return [status.routeId, status];
  }));
  timestamp(observedAt, "openai-route-observed-at-invalid");
  return deepFreeze(validatedRegistry.routes.flatMap((route) => {
    const status = byRoute.get(route.routeId) ?? null;
    const reason = projectionReason(route, status);
    const availability = status?.availability ?? (reason === null ? "healthy" : "configured");
    return route.capabilities.map((capability) => deepFreeze({
      capability,
      workerId: route.workerId,
      workerLabel: route.label,
      enabled: true,
      availability,
      routable: reason === null,
      evidenceLevel: reason === null ? "verified" : "observed",
      routingReason: reason,
      interfaceType: route.interfaceType,
      permissionClass: route.permissionClass,
      reliability: route.reliability,
      requiresAttendedDesktop: route.requiresAttendedDesktop,
      executionType: "cloud-provider",
      latencyMs: route.latencyMs,
      maximumWorkload: route.maximumWorkload,
      workload: status?.workload ?? 0,
      fallbackWorkerIds: [],
      costClass: route.costClass,
      dataClasses: route.dataClasses,
      executionPlane: route.executionPlane,
      economicTier: route.economicTier,
      observedAt,
    }));
  }));
}

export function acceptOpenAiRouteResult({ registry, privateBindings = [], receipt, expectedRouteId = null, expectedTaskDigest = null, expectedBaseSha = null } = {}) {
  const validatedRegistry = validateOpenAiRouteRegistry(registry);
  const result = validateOpenAiRouteResult(receipt);
  const route = validatedRegistry.routes.find((item) => item.routeId === result.routeId);
  if (!route) fail("route-mismatch");
  if (expectedRouteId !== null && result.routeId !== routeId(expectedRouteId, "route-mismatch")) fail("route-mismatch");
  if (result.repository !== validatedRegistry.repository) fail("route-mismatch");
  if (route.bindingState !== "paired" || route.publicTrust === null) fail("route-unconfigured");
  if (expectedTaskDigest !== null && result.taskDigest !== sha64(expectedTaskDigest, "task-digest-mismatch")) fail("task-digest-mismatch");
  if (expectedBaseSha !== null && result.baseSha !== sha40(expectedBaseSha, "base-head-mismatch")) fail("base-head-mismatch");
  if (result.publicKeyFingerprint !== route.publicTrust.publicKeyFingerprint || result.receiptKeyFingerprint !== route.publicTrust.publicKeyFingerprint) fail("public-key-mismatch");
  if (result.actorLogin !== route.publicTrust.keyId) fail("route-mismatch");
  if (fingerprintPublicKeySpki(result.publicKeySpki) !== route.publicTrust.publicKeyFingerprint) fail("public-key-mismatch");
  if (!verifySignedPayloadEnvelope(result.publicKeySpki, result)) fail("signature-invalid");
  const binding = privateBindings.map(validateOpenAiPrivateRouteBinding)
    .find((item) => item.routeId === route.routeId && item.repository === validatedRegistry.repository);
  if (!binding) fail("account-binding-mismatch");
  if (binding.receiptKeyFingerprint !== result.receiptKeyFingerprint) fail("public-key-mismatch");
  if (binding.codexAccountFingerprint !== result.codexAccountFingerprint) fail("account-binding-mismatch");
  if (binding.codexInstallationFingerprint !== result.codexInstallationFingerprint) fail("installation-binding-mismatch");
  if (binding.codexEnvironmentFingerprint !== result.codexEnvironmentFingerprint) fail("environment-binding-mismatch");
  return deepFreeze({
    accepted: true,
    routeId: route.routeId,
    sourceTaskId: result.sourceTaskId,
    taskDigest: result.taskDigest,
    baseSha: result.baseSha,
    candidateHeadSha: result.candidateHeadSha,
    observedAt: result.observedAt,
  });
}

function validateRoute(value, repository) {
  exact(value, ROUTE_KEYS, "openai-route-registry-route-invalid");
  const bindingState = allowed(value.bindingState, BINDING_STATES, "openai-route-registry-route-invalid");
  const publicTrust = bindingState === "paired"
    ? validatePublicTrust(value.publicTrust)
    : ensureNull(value.publicTrust, "openai-route-registry-route-invalid");
  return deepFreeze({
    routeId: routeId(value.routeId, "openai-route-registry-route-invalid"),
    workerId: routeId(value.workerId, "openai-route-registry-route-invalid"),
    label: text(value.label, 160, "openai-route-registry-route-invalid"),
    executorLane: token(value.executorLane, 64, "openai-route-registry-route-invalid"),
    receiptTrustMode: allowed(value.receiptTrustMode, RECEIPT_TRUST_MODES, "openai-route-registry-route-invalid"),
    bindingState,
    publicTrust,
    capabilities: tokenList(value.capabilities, 16, 96, "openai-route-registry-route-invalid"),
    dataClasses: enumList(value.dataClasses, DATA_CLASSES, 8, "openai-route-registry-route-invalid"),
    costClass: allowed(value.costClass, COST_CLASSES, "openai-route-registry-route-invalid"),
    executionPlane: token(value.executionPlane, 64, "openai-route-registry-route-invalid"),
    interfaceType: token(value.interfaceType, 64, "openai-route-registry-route-invalid"),
    permissionClass: token(value.permissionClass, 96, "openai-route-registry-route-invalid"),
    reliability: integer(value.reliability, 0, 100, "openai-route-registry-route-invalid"),
    latencyMs: integer(value.latencyMs, 0, 3_600_000, "openai-route-registry-route-invalid"),
    maximumWorkload: integer(value.maximumWorkload, 1, 16, "openai-route-registry-route-invalid"),
    requiresAttendedDesktop: boolean(value.requiresAttendedDesktop, "openai-route-registry-route-invalid"),
    economicTier: integer(value.economicTier, 0, 8, "openai-route-registry-route-invalid"),
  });
}

function validateTransport(value) {
  exact(value, TRANSPORT_KEYS, "openai-route-registry-invalid");
  return deepFreeze({
    githubAppSlug: token(value.githubAppSlug, 64, "openai-route-registry-invalid"),
    githubAppId: integer(value.githubAppId, 1, Number.MAX_SAFE_INTEGER, "openai-route-registry-invalid"),
  });
}

function validateTransportObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("openai-route-status-invalid");
  if (Object.keys(value).sort().join(",") !== ["fingerprint", "githubAppId", "githubAppSlug"].sort().join(",")) fail("openai-route-status-invalid");
  return deepFreeze({
    fingerprint: sha64(value.fingerprint, "openai-route-status-invalid"),
    githubAppId: integer(value.githubAppId, 1, Number.MAX_SAFE_INTEGER, "openai-route-status-invalid"),
    githubAppSlug: token(value.githubAppSlug, 64, "openai-route-status-invalid"),
  });
}

function validatePublicTrust(value) {
  exact(value, PUBLIC_TRUST_KEYS, "openai-route-registry-route-invalid");
  if (value.algorithm !== "ed25519") fail("openai-route-registry-route-invalid");
  return deepFreeze({
    algorithm: "ed25519",
    publicKeyFingerprint: sha64(value.publicKeyFingerprint, "openai-route-registry-route-invalid"),
    keyId: token(value.keyId, 64, "openai-route-registry-route-invalid"),
  });
}

function projectionReason(route, status) {
  if (route.bindingState !== "paired" || route.publicTrust === null) return "route-unconfigured";
  if (!status) return "readiness-missing";
  if (status.bindingState !== route.bindingState) return "route-mismatch";
  if (!status.ready) return status.reason;
  if (status.zeroCreditEligible !== true) return "zero-credit-not-eligible";
  if (status.exactHeadMatch !== true) return "base-head-mismatch";
  return null;
}

function routeId(value, code) { return token(value, 64, code); }
function repositoryName(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) fail(code); return value; }
function token(value, max, code) { if (typeof value !== "string" || value.length < 1 || value.length > max || !/^[A-Za-z0-9_.\[\]-]+$/.test(value)) fail(code); return value; }
function opaque(value, max, code) { if (typeof value !== "string" || value.trim().length < 1 || value.length > max || /[\0\r\n]/.test(value)) fail(code); return value; }
function spki(value) { if (typeof value !== "string" || !/^-----BEGIN PUBLIC KEY-----[\r\n]+(?:[A-Za-z0-9+/=\r\n]+)-----END PUBLIC KEY-----\r?\n?$/.test(value)) fail("openai-route-result-invalid"); return value; }
function signature(value) { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{80,128}$/.test(value)) fail("openai-route-result-invalid"); return value; }
function sha64(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) fail(code); return value.toLowerCase(); }
function sha40(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) fail(code); return value.toLowerCase(); }
function timestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function enumList(value, allowedValues, max, code) { if (!Array.isArray(value) || value.length < 1 || value.length > max || new Set(value).size !== value.length || value.some((item) => !allowedValues.has(item))) fail(code); return [...value].sort(); }
function tokenList(value, max, length, code) { if (!Array.isArray(value) || value.length < 1 || value.length > max || new Set(value).size !== value.length) fail(code); return value.map((item) => token(item, length, code)).sort(); }
function allowed(value, allowedValues, code) { if (!allowedValues.has(value)) fail(code); return value; }
function ensureNull(value, code) { if (value !== null) fail(code); return null; }
function boolean(value, code) { if (typeof value !== "boolean") fail(code); return value; }
function integer(value, min, max, code) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(code); return value; }
function text(value, max, code) { if (typeof value !== "string" || value.trim().length < 1 || value.length > max || /[\0\r\n]/.test(value)) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
