import test from "node:test";
import assert from "node:assert/strict";
import { selectZeroCreditProvider } from "../src/zero-credit-provider-selector.mjs";
import { createTaskRouter } from "../src/router.mjs";

const ready = (id) => ({ id, metered: false, priceUsd: 0, spendUsd: 0, billingState: "verified-zero", zeroDollarStopGuaranteed: true, ready: true, capabilityCanary: { fresh: true } });
const LOCAL_AI_DEV_ENV = { NODE_ENV: "development", ALLOW_LOCAL_AI_DEV: "true" };

function withLocalAiDevelopment(run) {
  const previous = { NODE_ENV: process.env.NODE_ENV, ALLOW_LOCAL_AI_DEV: process.env.ALLOW_LOCAL_AI_DEV };
  process.env.NODE_ENV = LOCAL_AI_DEV_ENV.NODE_ENV;
  process.env.ALLOW_LOCAL_AI_DEV = LOCAL_AI_DEV_ENV.ALLOW_LOCAL_AI_DEV;
  try { return run(); }
  finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.ALLOW_LOCAL_AI_DEV === undefined) delete process.env.ALLOW_LOCAL_AI_DEV; else process.env.ALLOW_LOCAL_AI_DEV = previous.ALLOW_LOCAL_AI_DEV;
  }
}

test("selects eligible providers in fixed zero-credit order", () => {
  const decision = selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers: [ready("local-open-weight"), ready("codespaces-open-weight")] });
  assert.deepEqual(decision, { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" });
  assert.equal(Object.isFrozen(decision), true);
});

test("cloud remains selected by default and local selection requires both development flags", () => {
  const providers = [ready("local-open-weight"), ready("codespaces-open-weight")];
  assert.equal(selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers, env: { NODE_ENV: "production", ALLOW_LOCAL_AI_DEV: "true" } }).providerId, "codespaces-open-weight");
  assert.equal(selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers, env: { NODE_ENV: "development" } }).providerId, "codespaces-open-weight");
  assert.equal(selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers, env: LOCAL_AI_DEV_ENV }).providerId, "codespaces-open-weight");
  assert.equal(selectZeroCreditProvider({ cloudModeEnabled: false, requiresGeneration: true, providers, env: LOCAL_AI_DEV_ENV }).providerId, "local-open-weight");
});

test("continues deterministically and waits without a paid fallback", () => {
  assert.deepEqual(selectZeroCreditProvider({ cloudModeEnabled: false, requiresGeneration: false, providers: [] }), { status: "selected", providerId: "deterministic-only", costClass: "deterministic" });
  assert.deepEqual(selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers: [] }), { status: "waiting", providerId: "waiting-zero-credit-provider", costClass: null });
});

test("duplicate provider evidence fails closed regardless of ordering and allows an unambiguous fallback", () => {
  const good = ready("codespaces-open-weight");
  const paid = { ...good, metered: true };
  for (const cloudEvidence of [[good, paid], [paid, good]]) {
    const options = { cloudModeEnabled: true, requiresGeneration: true, providers: cloudEvidence };
    assert.equal(selectZeroCreditProvider(options).status, "waiting");
    assert.equal(selectZeroCreditProvider({ ...options, providers: [...cloudEvidence, ready("local-open-weight")], env: LOCAL_AI_DEV_ENV }).providerId, "local-open-weight");
  }
});

test("rejects incomplete, metered, unknown-billing, stale-canary, and unready provider evidence", () => {
  for (const provider of [
    { ...ready("codespaces-open-weight"), metered: true }, { ...ready("codespaces-open-weight"), billingState: "unknown" },
    { ...ready("codespaces-open-weight"), capabilityCanary: { fresh: false } }, { ...ready("codespaces-open-weight"), ready: false },
    { ...ready("codespaces-open-weight"), zeroDollarStopGuaranteed: false }, { ...ready("local-open-weight"), zeroDollarStopGuaranteed: false },
    (({ metered, ...provider }) => provider)(ready("codespaces-open-weight")), (({ spendUsd, ...provider }) => provider)(ready("codespaces-open-weight")),
  ]) {
    const decision = selectZeroCreditProvider({ cloudModeEnabled: true, requiresGeneration: true, providers: [provider] });
    assert.equal(decision.providerId, "waiting-zero-credit-provider");
  }
});

test("zero-credit policy filters autonomous routes and leaves ordinary routing unchanged", () => {
  const manifest = { costModes: { local: ["deterministic", "local-model", "cloud-open-weight"] }, routingPolicy: { interfaceOrder: ["deterministic-worker"], availabilityOrder: ["configured"], minimumReliability: 0 }, workers: [
    { id: "cloud", label: "Cloud", enabled: true, costClass: "cloud-open-weight", dataClasses: ["synthetic"], capabilities: ["autonomy.self-upgrade"], routing: { interfaceType: "deterministic-worker", permissionClass: "bounded-local", reliability: 90, requiresAttendedDesktop: false, executionType: "deterministic", latencyMs: 1, maximumWorkload: 1, fallbackWorkerIds: [] } },
    { id: "local", label: "Local", enabled: true, costClass: "local-model", dataClasses: ["synthetic"], capabilities: ["autonomy.self-upgrade"], routing: { interfaceType: "deterministic-worker", permissionClass: "bounded-local", reliability: 90, requiresAttendedDesktop: false, executionType: "deterministic", latencyMs: 2, maximumWorkload: 1, fallbackWorkerIds: [] } },
  ] };
  const task = { capability: "autonomy.self-upgrade", dataClass: "synthetic", requestedMode: "local" };
  const context = { providerPolicy: "zero-credit", cloudModeEnabled: false, requiresGeneration: true, providers: [ready("local-open-weight")] };
  const router = createTaskRouter({ rankRoutes: () => ({
    reason: null,
    candidates: [
      { workerId: "local", costClass: "local-model" },
      { workerId: "cloud", costClass: "cloud-open-weight" },
    ],
  }) });
  const localRoute = withLocalAiDevelopment(() => router(manifest, task, context));
  assert.equal(localRoute.worker.id, "local");
  assert.equal(localRoute.providerDecision.providerId, "local-open-weight");
  assert.equal(router(manifest, task).worker.id, "local");
});

test("waiting zero-credit autonomy routing skips general ranking", () => {
  const router = createTaskRouter({ rankRoutes: () => { throw new Error("general ranking must not run"); } });
  const route = router({}, { capability: "autonomy.self-upgrade", dataClass: "synthetic", requestedMode: "local" }, { providerPolicy: "zero-credit", requiresGeneration: true, providers: [] });
  assert.equal(route.status, "waiting");
  assert.equal(route.reason, "waiting-zero-credit-provider");
  assert.equal(route.worker, null);
  assert.deepEqual(route.providerDecision, { status: "waiting", providerId: "waiting-zero-credit-provider", costClass: null });
  assert.equal(route.authorityDecision.decision, "hold");
  assert.deepEqual(route.authorityDecision.reasonCodes, ["provider-unavailable"]);
});
