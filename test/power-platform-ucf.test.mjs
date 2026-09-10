import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { routeTask, capabilityIndex } from "../src/router.mjs";
import { planConversationCapabilities } from "../src/conversation-capability-planner.mjs";

const NOW = Date.parse("2026-09-10T19:00:00.000Z");
function verifiedState(manifest, workerId) {
  const worker = manifest.workers.find((item) => item.id === workerId);
  return { workerId, status: "live", lastHeartbeatAt: "2026-09-10T18:59:59.000Z", readiness: worker.capabilities.map((capability) => ({
    workerId, capability, processStatus: "live", providerStatus: "ready", canaryStatus: "verified",
    processObservedAt: "2026-09-10T18:59:59.000Z", providerObservedAt: "2026-09-10T18:59:58.000Z", canaryVerifiedAt: "2026-09-10T18:59:57.000Z", lastErrorCode: null,
  })) };
}

test("manifest registers Power Platform and Copilot Studio with capability billing classes", async () => {
  const manifest = await loadManifest();
  const power = manifest.workers.find((item) => item.id === "power-platform");
  const studio = manifest.workers.find((item) => item.id === "copilot-studio");
  assert.equal(power.enabled, true);
  assert.deepEqual(power.capabilities, ["powerplatform.health", "powerplatform.discover"]);
  assert.deepEqual(power.billingClassByCapability, { "powerplatform.health": "deterministic-zero", "powerplatform.discover": "deterministic-zero" });
  assert.equal(studio.enabled, true);
  assert.equal(studio.billingClassByCapability["studio.delegate"], "unknown");
  assert.deepEqual(studio.authorityScopesByCapability["studio.delegate"], ["connector.invoke", "copilot.invoke"]);
});

test("zero-credit router admits deterministic Power Platform discovery", async () => {
  const manifest = await loadManifest();
  const route = routeTask(manifest, { capability: "powerplatform.discover", dataClass: "enterprise", requestedMode: "local" }, {
    workerStates: [verifiedState(manifest, "power-platform")], now: NOW, providerPolicy: "zero-credit",
  });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "power-platform");
  assert.equal(route.decision.billingClass, "deterministic-zero");
});

test("zero-credit router blocks Studio until exact route billing is attested license-included", async () => {
  const manifest = await loadManifest();
  const task = { capability: "studio.delegate", dataClass: "enterprise", requestedMode: "hybrid" };
  const context = {
    workerStates: [verifiedState(manifest, "copilot-studio")], now: NOW, providerPolicy: "zero-credit",
    platformAuthorityScopesByWorkerId: { "copilot-studio": ["connector.invoke", "copilot.invoke"] },
  };
  const blocked = routeTask(manifest, task, context);
  assert.equal(blocked.status, "waiting");
  assert.equal(blocked.reason, "billing-not-zero-credit");
  const admitted = routeTask(manifest, task, {
    ...context,
    billingAttestationByWorkerId: { "copilot-studio": { "studio.delegate": "license-included" } },
  });
  assert.equal(admitted.status, "routable");
  assert.equal(admitted.worker.id, "copilot-studio");
  assert.equal(admitted.billingDecision.effectiveClass, "license-included");
});

test("conversation planner selects Studio only for explicit Studio consultation and only when route is plannable", async () => {
  const manifest = await loadManifest();
  const routes = capabilityIndex(manifest, [verifiedState(manifest, "copilot-studio")], NOW, {}).map((route) => ({
    capability: route.capability, workerId: route.workerId, enabled: route.enabled, routable: route.routable,
    routingReason: route.routingReason, dataClasses: route.dataClasses, economicTier: route.economicTier,
  }));
  const explicit = planConversationCapabilities({ content: "Consult Copilot Studio to validate this architecture", capabilityRoutes: routes });
  assert.equal(explicit.capabilityPlan.includes("studio.delegate"), true);
  const generic = planConversationCapabilities({ content: "Summarize my Microsoft 365 work", capabilityRoutes: routes });
  assert.equal(generic.capabilityPlan.includes("studio.delegate"), false);
});

test("manifest rejects invalid Microsoft capability billing classes", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.find((item) => item.id === "copilot-studio").billingClassByCapability["studio.delegate"] = "free-ish";
  assert.throws(() => validateManifest(manifest), /billing/i);
});


test("Studio zero-credit routing can use supervisor-owned health evidence without caller authority fields", async () => {
  const manifest = await loadManifest();
  const state = verifiedState(manifest, "copilot-studio");
  state.platformAuthorityScopes = ["connector.invoke", "copilot.invoke"];
  state.billingAttestationByCapability = { "studio.delegate": "license-included" };
  const route = routeTask(manifest, { capability: "studio.delegate", dataClass: "enterprise", requestedMode: "hybrid" }, {
    workerStates: [state], now: NOW, providerPolicy: "zero-credit",
  });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "copilot-studio");
  assert.equal(route.billingDecision.effectiveClass, "license-included");
  assert.equal(route.authorityDecision.authorized, true);
});