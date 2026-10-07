import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { loadManifest } from "../src/config.mjs";
import { capabilityIndex, routeTask } from "../src/router.mjs";
import {
  acceptOpenAiRouteResult,
  loadOpenAiRouteRegistry,
  projectOpenAiCapabilityRoutes,
  validateOpenAiPrivateRouteBinding,
  validateOpenAiRouteRegistry,
  validateOpenAiRouteResult,
} from "../src/openai-route-registry.mjs";
import { fingerprintPublicKeySpki } from "../src/destiny-trigger-trust.mjs";

const NOW = Date.parse("2026-09-08T21:00:00.000Z");

function configuredRegistry(publicKeyFingerprint, keyId = "destiny-route") {
  return validateOpenAiRouteRegistry({
    schemaVersion: 1,
    kind: "openai-route-registry",
    repository: "michaeljwilliams0123/mahoraga",
    transport: { githubAppSlug: "chatgpt-codex-connector", githubAppId: 1144995 },
    routes: [
      {
        routeId: "openai-destiny",
        workerId: "openai-destiny",
        label: "Paired OpenAI Destiny",
        executorLane: "destiny-codex",
        receiptTrustMode: "signed-receipt",
        bindingState: "paired",
        publicTrust: { algorithm: "ed25519", publicKeyFingerprint, keyId },
        capabilities: ["codex.execute"],
        dataClasses: ["synthetic"],
        costClass: "licensed-cloud",
        executionPlane: "paired-openai",
        interfaceType: "application-extension",
        permissionClass: "bounded-openai-route",
        reliability: 78,
        latencyMs: 1500,
        maximumWorkload: 1,
        requiresAttendedDesktop: false,
        economicTier: 2,
      },
      {
        routeId: "openai-primary",
        workerId: "openai-primary",
        label: "Paired OpenAI Primary",
        executorLane: "primary-cloud-codex",
        receiptTrustMode: "signed-receipt",
        bindingState: "unconfigured",
        publicTrust: null,
        capabilities: ["codex.execute"],
        dataClasses: ["synthetic"],
        costClass: "licensed-cloud",
        executionPlane: "paired-openai",
        interfaceType: "application-extension",
        permissionClass: "bounded-openai-route",
        reliability: 78,
        latencyMs: 1500,
        maximumWorkload: 1,
        requiresAttendedDesktop: false,
        economicTier: 2,
      },
    ],
  });
}

function routeStatus(overrides = {}) {
  return {
    routeId: "openai-destiny",
    bindingState: "paired",
    ready: true,
    reason: null,
    observedAt: "2026-09-08T20:59:00.000Z",
    zeroCreditEligible: true,
    exactHeadMatch: true,
    availability: "healthy",
    workload: 0,
    transport: null,
    ...overrides,
  };
}

function signReceipt(privateKey, body) {
  return sign(null, Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(body).sort().map((key) => [key, body[key]])))), privateKey).toString("base64url");
}

function verifiedWorkerState(manifest, workerId, processStatus = "live") {
  const worker = manifest.workers.find((item) => item.id === workerId);
  return {
    workerId,
    status: processStatus,
    lastHeartbeatAt: "2026-09-08T20:59:55.000Z",
    readiness: worker.capabilities.map((capability) => ({
      workerId,
      capability,
      processStatus,
      providerStatus: "ready",
      canaryStatus: "verified",
      processObservedAt: "2026-09-08T20:59:55.000Z",
      providerObservedAt: "2026-09-08T20:59:30.000Z",
      canaryVerifiedAt: "2026-09-08T20:59:00.000Z",
      lastErrorCode: null,
    })),
  };
}

test("route registry keeps unconfigured routes out of the routable capability graph", async () => {
  const manifest = await loadManifest();
  const registry = await loadOpenAiRouteRegistry();
  const routes = projectOpenAiCapabilityRoutes({ registry, routeStatuses: [routeStatus()] });
  assert.equal(routes.find((item) => item.workerId === "openai-destiny").routable, false);
  assert.equal(routes.find((item) => item.workerId === "openai-destiny").routingReason, "route-unconfigured");
  const capabilities = capabilityIndex(manifest, [], NOW, { openAiRouteRegistry: registry, openAiRouteStatuses: [routeStatus()] });
  assert.equal(capabilities.some((item) => item.workerId === "openai-destiny" && item.routable), false);
});

test("verified paired routes project into routing without replacing deterministic workers", async () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpki = publicKey.export({ type: "spki", format: "pem" });
  const manifest = await loadManifest();
  const registry = configuredRegistry(fingerprintPublicKeySpki(publicKeySpki));
  const pairedContext = { openAiRouteRegistry: registry, openAiRouteStatuses: [routeStatus()], now: NOW };
  const paired = routeTask(manifest, { capability: "codex.execute", dataClass: "synthetic", requestedMode: "hybrid", allowedWorkerIds: ["openai-destiny", "primary-codex-builder"] }, pairedContext);
  assert.equal(paired.status, "routable");
  assert.equal(paired.worker.id, "openai-destiny");
  const deterministic = routeTask(manifest, { capability: "system.health", dataClass: "synthetic", requestedMode: "local" }, { ...pairedContext, workerStates: [verifiedWorkerState(manifest, "local-core")], now: NOW });
  assert.equal(deterministic.worker.id, "local-core");
  const blocked = routeTask(manifest, { capability: "codex.execute", dataClass: "synthetic", requestedMode: "hybrid", allowedWorkerIds: ["openai-destiny"] }, { openAiRouteRegistry: registry, openAiRouteStatuses: [routeStatus({ zeroCreditEligible: false })], now: NOW });
  assert.equal(blocked.status, "waiting");
  assert.equal(blocked.reason, "zero-credit-not-eligible");
});

test("paired readiness expires without laundering the source observation time", () => {
  const registry = configuredRegistry("a".repeat(64));
  const observedAt = new Date(NOW).toISOString();
  const project = (overrides) => projectOpenAiCapabilityRoutes({ registry, routeStatuses: [routeStatus(overrides)], observedAt })
    .find((route) => route.workerId === "openai-destiny");
  const fresh = project({});
  assert.equal(fresh.routable, true);
  assert.equal(fresh.lastObservedAt, routeStatus().observedAt);
  assert.equal(fresh.lastVerifiedAt, routeStatus().observedAt);
  for (const time of [NOW - 15 * 60_000 - 1, NOW + 1]) {
    const route = project({ observedAt: new Date(time).toISOString() });
    assert.equal(route.routable, false);
    assert.equal(route.routingReason, "readiness-stale");
    assert.equal(route.lastObservedAt, new Date(time).toISOString());
    assert.equal(route.lastVerifiedAt, null);
  }
  assert.equal(project({ observedAt: new Date(NOW - 15 * 60_000).toISOString() }).routable, true);
});

test("paired readiness cannot override provider health or workload capacity", () => {
  const registry = configuredRegistry("a".repeat(64));
  for (const availability of ["offline", "unhealthy", "unavailable", "disabled", "stale", "starting", "configured"]) {
    const [route] = projectOpenAiCapabilityRoutes({ registry, routeStatuses: [routeStatus({ availability })], observedAt: new Date(NOW).toISOString() });
    assert.equal(route.routable, false, availability);
    assert.equal(route.routingReason, "provider-unavailable");
  }
  for (const availability of ["healthy", "busy"]) {
    const [route] = projectOpenAiCapabilityRoutes({ registry, routeStatuses: [routeStatus({ availability, workload: 1 })], observedAt: new Date(NOW).toISOString() });
    assert.equal(route.routable, false);
    assert.equal(route.routingReason, "workers-at-capacity");
  }
});

test("registry rejects distinct route identities sharing a worker identity", () => {
  const registry = structuredClone(configuredRegistry("a".repeat(64)));
  registry.routes[1].workerId = registry.routes[0].workerId;
  assert.throws(() => validateOpenAiRouteRegistry(registry), /openai-route-registry-worker-duplicate/);
});

test("signed paired-route results reject cross-lane substitution even under shared GitHub transport", () => {
  const destiny = generateKeyPairSync("ed25519");
  const primary = generateKeyPairSync("ed25519");
  const destinySpki = destiny.publicKey.export({ type: "spki", format: "pem" });
  const primarySpki = primary.publicKey.export({ type: "spki", format: "pem" });
  const destinyFingerprint = fingerprintPublicKeySpki(destinySpki);
  const registry = configuredRegistry(destinyFingerprint, "destiny-route");
  const privateBinding = validateOpenAiPrivateRouteBinding({
    schemaVersion: 1,
    kind: "openai-private-route-binding",
    routeId: "openai-destiny",
    repository: "michaeljwilliams0123/mahoraga",
    codexAccountFingerprint: "a".repeat(64),
    codexInstallationFingerprint: "b".repeat(64),
    codexEnvironmentFingerprint: "c".repeat(64),
    receiptKeyFingerprint: destinyFingerprint,
    boundAt: "2026-09-08T20:00:00.000Z",
  });
  const base = {
    schemaVersion: 1,
    kind: "openai-route-result",
    routeId: "openai-destiny",
    repository: "michaeljwilliams0123/mahoraga",
    sourceTaskId: "dct-0123456789abcdef01234567",
    taskDigest: "d".repeat(64),
    baseSha: "e".repeat(40),
    candidateHeadSha: "f".repeat(40),
    codexAccountFingerprint: "a".repeat(64),
    codexInstallationFingerprint: "b".repeat(64),
    codexEnvironmentFingerprint: "c".repeat(64),
    receiptKeyFingerprint: destinyFingerprint,
    status: "completed",
    observedAt: "2026-09-08T20:30:00.000Z",
    actorLogin: "destiny-route",
    publicKeyFingerprint: destinyFingerprint,
    publicKeySpki: destinySpki,
    creditsUsed: "true",
    creditsEvidence: { observedAt: "2026-09-08T20:29:00.000Z", source: "codex-usage-receipt" },
  };
  const good = { ...base, signature: signReceipt(destiny.privateKey, base) };
  const accepted = acceptOpenAiRouteResult({ registry, privateBindings: [privateBinding], receipt: good, expectedRouteId: "openai-destiny", expectedTaskDigest: base.taskDigest, expectedBaseSha: base.baseSha });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.creditsUsed, "true");
  assert.deepEqual(accepted.creditsEvidence, base.creditsEvidence);

  const wrongKeyBody = { ...base, publicKeyFingerprint: fingerprintPublicKeySpki(primarySpki), publicKeySpki: primarySpki, receiptKeyFingerprint: fingerprintPublicKeySpki(primarySpki) };
  const wrongKey = { ...wrongKeyBody, signature: signReceipt(primary.privateKey, wrongKeyBody) };
  assert.throws(() => acceptOpenAiRouteResult({ registry, privateBindings: [privateBinding], receipt: wrongKey, expectedRouteId: "openai-destiny", expectedTaskDigest: base.taskDigest, expectedBaseSha: base.baseSha }), /public-key-mismatch/);

  const wrongAccountBody = { ...base, codexAccountFingerprint: "9".repeat(64) };
  const wrongAccount = { ...wrongAccountBody, signature: signReceipt(destiny.privateKey, wrongAccountBody) };
  assert.throws(() => acceptOpenAiRouteResult({ registry, privateBindings: [privateBinding], receipt: wrongAccount, expectedRouteId: "openai-destiny", expectedTaskDigest: base.taskDigest, expectedBaseSha: base.baseSha }), /account-binding-mismatch/);
});

test("credits-used attribution never fabricates true/false without attributable usage evidence", () => {
  const base = {
    schemaVersion: 1,
    kind: "openai-route-result",
    routeId: "openai-destiny",
    repository: "michaeljwilliams0123/mahoraga",
    sourceTaskId: "dct-0123456789abcdef01234567",
    taskDigest: "d".repeat(64),
    baseSha: "e".repeat(40),
    candidateHeadSha: null,
    codexAccountFingerprint: "a".repeat(64),
    codexInstallationFingerprint: "b".repeat(64),
    codexEnvironmentFingerprint: "c".repeat(64),
    receiptKeyFingerprint: "d".repeat(64),
    status: "completed",
    observedAt: "2026-09-08T20:30:00.000Z",
    actorLogin: "destiny-route",
    publicKeyFingerprint: "d".repeat(64),
    publicKeySpki: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n-----END PUBLIC KEY-----\n",
    signature: "a".repeat(86),
  };

  // Absence of evidence must stay "unknown" with no evidence payload attached.
  const unknown = validateOpenAiRouteResult({ ...base, creditsUsed: "unknown", creditsEvidence: null });
  assert.equal(unknown.creditsUsed, "unknown");
  assert.equal(unknown.creditsEvidence, null);

  // "unknown" paired with a fabricated evidence object is rejected.
  assert.throws(
    () => validateOpenAiRouteResult({ ...base, creditsUsed: "unknown", creditsEvidence: { source: "codex-usage-receipt", observedAt: base.observedAt } }),
    /openai-route-result-credits-evidence-invalid/,
  );

  // A "true"/"false" attribution requires an evidence object naming its source.
  assert.throws(
    () => validateOpenAiRouteResult({ ...base, creditsUsed: "true", creditsEvidence: null }),
    /openai-route-result-credits-evidence-invalid/,
  );
  assert.throws(
    () => validateOpenAiRouteResult({ ...base, creditsUsed: "false", creditsEvidence: null }),
    /openai-route-result-credits-evidence-invalid/,
  );

  const notUsed = validateOpenAiRouteResult({ ...base, creditsUsed: "false", creditsEvidence: { source: "codex-usage-receipt", observedAt: base.observedAt } });
  assert.equal(notUsed.creditsUsed, "false");
  assert.deepEqual(notUsed.creditsEvidence, { source: "codex-usage-receipt", observedAt: base.observedAt });

  // Any value outside the tri-state (e.g. a fabricated boolean) is rejected outright.
  assert.throws(() => validateOpenAiRouteResult({ ...base, creditsUsed: true, creditsEvidence: null }), /openai-route-result-invalid/);
});
