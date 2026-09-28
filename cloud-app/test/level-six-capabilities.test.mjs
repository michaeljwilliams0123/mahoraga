import assert from "node:assert/strict";
import test from "node:test";

import { canSubmitDeterministicCognitiveChat, canSubmitPredictiveChat, projectCapabilityFamilies } from "../lib/capability-families.ts";

test("unpaired workspace never advertises runtime capability", () => {
  const families = projectCapabilityFamilies(false, [{ capability: "assistant.respond", routable: true, workerIds: [] }]);
  assert.deepEqual(families.map((family) => family.state), ["unobserved", "unobserved", "unobserved", "unobserved"]);
});

test("live route evidence distinguishes generative, agentic, and predictive availability", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "assistant.respond", routable: true, enabled: true, evidenceLevel: "runtime-probe", workerIds: [] },
    { capability: "codex.execute", routable: false, enabled: true, routingReason: "canary-stale", workerIds: ["builder"] },
    { capability: "cognitive.predict", routable: true, enabled: true, workerIds: ["cognitive-core"] },
  ]);
  assert.deepEqual(families.map((family) => family.state), ["routable", "unavailable", "unavailable", "routable"]);
  assert.equal(families[0].evidence, "runtime-probe");
  assert.equal(families[2].reason, "canary-stale");
  assert.equal(families[3].route, "cognitive.predict");
});

test("disabled and unreported routes remain unavailable; no benchmark strength is inferred", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "assistant.respond", routable: true, enabled: false, workerIds: [] },
    { capability: "cognitive.deliberate", routable: true, workerIds: [] },
  ]);
  assert.deepEqual(families.map((family) => family.state), ["unavailable", "unavailable", "unavailable", "unavailable"]);
  assert.equal(families[1].reason, "route-not-reported");
});

test("licensed agentic route is visible without implying zero-credit chat authority", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "codex.execute", routable: true, enabled: true, costClass: "licensed-cloud", workerIds: ["builder"] },
  ]);
  assert.equal(families[2].state, "core-only");
  assert.equal(families[2].reason, "non-zero-credit-route");
});

test("permissioned connector execution is visible independently of codex execution", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "repository.inspect", routable: true, enabled: true, costClass: "deterministic", permissionClass: "read", evidenceLevel: "runtime-execution", workerIds: ["connector-github"] },
    { capability: "codex.execute", routable: false, enabled: false, routingReason: "builder-unavailable", workerIds: ["builder"] },
  ]);
  assert.equal(families[2].label, "Execution");
  assert.equal(families[2].state, "routable");
  assert.equal(families[2].route, "repository.inspect");
  assert.equal(families[2].evidence, "runtime-execution");
});

test("prediction remains sendable without an answer route, but normal chat and attachments do not", () => {
  const routes = [{ capability: "cognitive.predict", routable: true, enabled: true, costClass: "deterministic", workerIds: ["cognitive-core"] }];
  assert.equal(canSubmitPredictiveChat(true, routes, '/predict {"observedState":{}}', 0), true);
  assert.equal(canSubmitPredictiveChat(true, routes, "Predict tomorrow's demand", 0), false);
  assert.equal(canSubmitPredictiveChat(true, routes, "/predict {}", 1), false);
  assert.equal(canSubmitPredictiveChat(false, routes, "/predict {}", 0), false);
  assert.equal(canSubmitPredictiveChat(true, [{ ...routes[0], costClass: "licensed-cloud" }], "/predict {}", 0), false);
});

test("a reported deterministic cognitive cycle activates agentic reasoning without implying mutation", () => {
  const routes = [{ capability: "cognitive.cycle", routable: true, enabled: true, costClass: "deterministic", evidenceLevel: "runtime-execution", workerIds: ["cognitive-core"] }];
  const families = projectCapabilityFamilies(true, routes);
  assert.equal(families[1].state, "routable");
  assert.equal(families[1].route, "cognitive.cycle");
  assert.equal(canSubmitDeterministicCognitiveChat(true, routes, "/cycle {}", 0), true);
  assert.equal(canSubmitDeterministicCognitiveChat(true, routes, "run a cycle", 0), false);
  assert.equal(canSubmitDeterministicCognitiveChat(true, routes, "/cycle {}", 1), false);
});


test("browser desktop memory and artifact workers project through the universal execution family", () => {
  for (const capability of ["browser.execute", "desktop.execute", "memory.write", "artifact.inspect"]) {
    const families = projectCapabilityFamilies(true, [
      { capability, routable: true, enabled: true, costClass: "zero-credit", evidenceLevel: "runtime-execution", workerIds: ["worker-1"] },
    ]);
    assert.equal(families[2].state, "routable", capability);
    assert.equal(families[2].route, capability);
  }
});
