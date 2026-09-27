import assert from "node:assert/strict";
import test from "node:test";

import { projectCapabilityFamilies } from "../lib/capability-families.ts";

test("unpaired workspace never advertises runtime capability", () => {
  const families = projectCapabilityFamilies(false, [{ capability: "assistant.respond", routable: true, workerIds: [] }]);
  assert.deepEqual(families.map((family) => family.state), ["unobserved", "unobserved", "unobserved"]);
});

test("live route evidence distinguishes generative, agentic, and predictive availability", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "assistant.respond", routable: true, enabled: true, evidenceLevel: "runtime-probe", workerIds: [] },
    { capability: "codex.execute", routable: false, enabled: true, routingReason: "canary-stale", workerIds: ["builder"] },
    { capability: "cognitive.predict", routable: true, enabled: true, workerIds: ["cognitive-core"] },
  ]);
  assert.deepEqual(families.map((family) => family.state), ["routable", "unavailable", "routable"]);
  assert.equal(families[0].evidence, "runtime-probe");
  assert.equal(families[1].reason, "canary-stale");
  assert.equal(families[2].route, "cognitive.predict");
});

test("disabled and unreported routes remain unavailable; no benchmark strength is inferred", () => {
  const families = projectCapabilityFamilies(true, [
    { capability: "assistant.respond", routable: true, enabled: false, workerIds: [] },
    { capability: "cognitive.deliberate", routable: true, workerIds: [] },
  ]);
  assert.deepEqual(families.map((family) => family.state), ["unavailable", "unavailable", "unavailable"]);
  assert.equal(families[1].reason, "route-not-reported");
});
