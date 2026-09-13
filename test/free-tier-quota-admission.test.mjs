import test from "node:test";
import assert from "node:assert/strict";
import { createTaskRouter } from "../src/router.mjs";
import { isZeroMarginalCreditEligible } from "../src/resource-economy.mjs";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { ESSENTIAL_FILES } from "../src/repair.mjs";

const NOW = Date.parse("2026-09-12T04:15:00.000Z");
const CAPABILITY = "cloud.free.task";
const WORKER_ID = "free-tier-worker";

function candidate() {
  return {
    capability: CAPABILITY,
    workerId: WORKER_ID,
    workerLabel: "Free Tier Worker",
    enabled: true,
    costClass: "cloud-open-weight",
    billingClass: "free-tier-zero",
    dataClasses: ["synthetic"],
    authorityScopes: [],
    platformAuthorityScopes: [],
    executionPlane: "cloud",
    interfaceType: "native-api",
    permissionClass: "bounded-cloud",
    reliability: 90,
    requiresAttendedDesktop: false,
    executionType: "remote-provider",
    latencyMs: 100,
    maximumWorkload: 1,
    fallbackWorkerIds: [],
  };
}

function manifest() {
  return {
    ownerAuthority: null,
    workers: [{
      id: WORKER_ID,
      label: "Free Tier Worker",
      enabled: true,
      costClass: "cloud-open-weight",
      dataClasses: ["synthetic"],
      capabilities: [CAPABILITY],
      executionPlane: "cloud",
      routing: {
        interfaceType: "native-api",
        permissionClass: "bounded-cloud",
        reliability: 90,
        requiresAttendedDesktop: false,
        executionType: "remote-provider",
        latencyMs: 100,
        maximumWorkload: 1,
        fallbackWorkerIds: [],
      },
    }],
  };
}

function router() {
  return createTaskRouter({
    rankRoutes: () => ({ candidates: [candidate()], considered: [{ workerId: WORKER_ID }], reason: null }),
  });
}

const task = { capability: CAPABILITY, dataClass: "synthetic", requestedMode: "hybrid" };

test("free-tier billing is not zero-marginal without fresh allowance evidence", () => {
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero"), false);
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero", {
    status: "available",
    observedAt: "2026-09-12T04:14:30.000Z",
    expiresAt: "2026-09-12T04:20:00.000Z",
  }, NOW), true);
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero", {
    status: "exhausted",
    observedAt: "2026-09-12T04:14:30.000Z",
    expiresAt: "2026-09-12T04:20:00.000Z",
  }, NOW), false);
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero", {
    status: "available",
    observedAt: "2026-09-12T03:00:00.000Z",
    expiresAt: "2026-09-12T04:00:00.000Z",
  }, NOW), false);
});

test("zero-credit routing holds a free-tier route until current quota evidence is available", () => {
  const routeTask = router();
  const blocked = routeTask(manifest(), task, { providerPolicy: "zero-credit", now: NOW });
  assert.equal(blocked.status, "waiting");
  assert.equal(blocked.reason, "billing-not-zero-credit");

  const admitted = routeTask(manifest(), task, {
    providerPolicy: "zero-credit",
    now: NOW,
    resourceEconomyAttestationByWorkerId: {
      [WORKER_ID]: {
        [CAPABILITY]: {
          status: "available",
          observedAt: "2026-09-12T04:14:30.000Z",
          expiresAt: "2026-09-12T04:20:00.000Z",
        },
      },
    },
  });
  assert.equal(admitted.status, "routable");
  assert.equal(admitted.billingDecision.effectiveClass, "free-tier-zero");
  assert.equal(admitted.billingDecision.eligible, true);
});

test("manifest validation recognizes the shared free-tier billing class", async () => {
  const value = structuredClone(await loadManifest());
  const worker = value.workers.find((item) => item.id === "question-model");
  worker.billingClassByCapability = Object.fromEntries(worker.capabilities.map((capability) => [capability, "free-tier-zero"]));
  assert.doesNotThrow(() => validateManifest(value));
});

test("self-healer protects provider-neutral economy dependencies", () => {
  assert.equal(ESSENTIAL_FILES.includes("src/resource-economy.mjs"), true);
  assert.equal(ESSENTIAL_FILES.includes("src/microsoft-usage-cost.mjs"), true);
});


test("free-tier quota admission is reflected in canonical authority decisions", () => {
  const routeTask = router();
  const blocked = routeTask(manifest(), task, { providerPolicy: "zero-credit", now: NOW });
  assert.equal(blocked.authorityDecision.kind, "authority-decision-v1");
  assert.equal(blocked.authorityDecision.decision, "hold");
  assert.deepEqual(blocked.authorityDecision.reasonCodes, ["billing-not-zero-credit"]);

  const admitted = routeTask(manifest(), task, {
    providerPolicy: "zero-credit",
    now: NOW,
    resourceEconomyAttestationByWorkerId: {
      [WORKER_ID]: {
        [CAPABILITY]: {
          status: "available",
          observedAt: "2026-09-12T04:14:30.000Z",
          expiresAt: "2026-09-12T04:20:00.000Z",
        },
      },
    },
  });
  assert.equal(admitted.authorityDecision.decision, "allow");
});