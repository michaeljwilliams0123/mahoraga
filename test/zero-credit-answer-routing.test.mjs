import test from "node:test";
import assert from "node:assert/strict";
import { createTaskRouter } from "../src/router.mjs";

const provider = Object.freeze({
  id: "codespaces-open-weight",
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "verified-zero",
  zeroDollarStopGuaranteed: true,
  ready: true,
  capabilityCanary: Object.freeze({ fresh: true }),
});

const task = Object.freeze({
  capability: "assistant.respond",
  dataClass: "personal",
  requestedMode: "zero-credit",
  excludedWorkerIds: [],
});

const worker = Object.freeze({
  id: "codespaces-open-weight",
  label: "Zero-Credit Cloud Answer",
  enabled: true,
  costClass: "cloud-open-weight",
  dataClasses: ["personal"],
  capabilities: ["assistant.respond"],
  executionPlane: "cloud-open-weight",
  routing: {
    interfaceType: "native-api",
    permissionClass: "bounded-zero-credit-model",
    reliability: 92,
    requiresAttendedDesktop: false,
    executionType: "remote-provider",
    latencyMs: 750,
    maximumWorkload: 1,
    fallbackWorkerIds: [],
  },
});

const manifest = Object.freeze({
  ownerAuthority: null,
  workers: [worker],
});

function candidate() {
  return {
    workerId: worker.id,
    workerLabel: worker.label,
    capability: "assistant.respond",
    costClass: worker.costClass,
    billingClass: "deterministic-zero",
    authorityScopes: [],
    platformAuthorityScopes: [],
    dataClasses: ["personal"],
    executionPlane: worker.executionPlane,
    interfaceType: worker.routing.interfaceType,
    permissionClass: worker.routing.permissionClass,
    reliability: worker.routing.reliability,
    requiresAttendedDesktop: false,
    executionType: worker.routing.executionType,
    latencyMs: worker.routing.latencyMs,
    maximumWorkload: worker.routing.maximumWorkload,
    fallbackWorkerIds: [],
  };
}

test("zero-credit answer routing carries selected provider into canonical allow decision", () => {
  const router = createTaskRouter({ rankRoutes: () => ({ candidates: [candidate()], considered: [], reason: null }) });
  const route = router(manifest, task, {
    providerPolicy: "zero-credit",
    cloudModeEnabled: true,
    requiresGeneration: true,
    providers: [provider],
  });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "codespaces-open-weight");
  assert.deepEqual(route.providerDecision, { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" });
  assert.equal(route.billingDecision.effectiveClass, "deterministic-zero");
  assert.equal(route.billingDecision.eligible, true);
  assert.equal(route.authorityDecision.kind, "authority-decision-v1");
  assert.equal(route.authorityDecision.decision, "allow");
});

test("missing zero-credit evidence stops before ranking and cannot fall back to licensed model", () => {
  const router = createTaskRouter({ rankRoutes: () => { throw new Error("general ranking must not run"); } });
  const route = router(manifest, task, {
    providerPolicy: "zero-credit",
    cloudModeEnabled: true,
    requiresGeneration: true,
    providers: [],
  });
  assert.equal(route.status, "waiting");
  assert.equal(route.reason, "waiting-zero-credit-provider");
  assert.equal(route.worker, null);
  assert.deepEqual(route.providerDecision, { status: "waiting", providerId: "waiting-zero-credit-provider", costClass: null });
  assert.equal(route.authorityDecision.decision, "hold");
});
