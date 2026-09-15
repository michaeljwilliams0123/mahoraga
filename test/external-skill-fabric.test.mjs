import test from "node:test";
import assert from "node:assert/strict";

import { externalSkillProviders, projectExternalSkillRoutes } from "../src/external-skill-fabric.mjs";

const EXPECTED = new Map([
  ["wolfram", ["compute.health", "compute.query", "compute.context", "compute.evaluate"]],
  ["roleplay", ["training.health", "training.start", "training.turn", "training.debrief", "training.evaluate"]],
  ["edx", ["learning.health", "learning.search", "learning.details", "learning.compare"]],
  ["transkriptor", ["speech.health", "speech.transcript.list", "speech.transcript.read", "speech.summary", "speech.transcript.export", "speech.quota"]],
]);

test("external skill fabric declares four bounded provider families", () => {
  const providers = externalSkillProviders();
  assert.deepEqual(providers.map((item) => item.id), [...EXPECTED.keys()]);
  for (const provider of providers) {
    assert.deepEqual(provider.capabilities.map((item) => item.id), EXPECTED.get(provider.id));
    assert.equal(provider.costClass, "licensed-cloud");
    assert.equal(provider.defaultBillingClass, "unknown");
    assert.equal(provider.bridgeRequired, true);
    assert.equal(Object.isFrozen(provider), true);
  }
  const wolfram = providers.find((item) => item.id === "wolfram");
  assert.equal(wolfram.capabilities.find((item) => item.id === "compute.evaluate").permissionClass, "privileged-code-execution");
});

test("unbound external skills are visible but never routable", () => {
  const routes = projectExternalSkillRoutes();
  assert.equal(routes.length, [...EXPECTED.values()].reduce((sum, items) => sum + items.length, 0));
  for (const route of routes) {
    assert.equal(route.enabled, true);
    assert.equal(route.routable, false);
    assert.equal(route.routingReason, "connector-not-bound");
    assert.equal(route.billingClass, "unknown");
  }
});

test("only explicitly ready zero-marginal capabilities become routable", () => {
  const routes = projectExternalSkillRoutes({
    readiness: {
      wolfram: { bridgeReady: true, capabilities: ["compute.query", "compute.context"], billingClass: "license-included" },
      edx: { bridgeReady: true, capabilities: ["learning.search"], billingClass: "metered" },
    },
  });
  assert.equal(routes.find((item) => item.capability === "compute.query").routable, true);
  assert.equal(routes.find((item) => item.capability === "compute.context").routable, true);
  assert.equal(routes.find((item) => item.capability === "compute.evaluate").routable, false);
  assert.equal(routes.find((item) => item.capability === "learning.search").routable, false);
  assert.equal(routes.find((item) => item.capability === "learning.search").routingReason, "cost-not-admitted");
});

test("read-only learning and transcript descriptors do not claim unsupported mutations or live speech", () => {
  const ids = externalSkillProviders().flatMap((provider) => provider.capabilities.map((item) => item.id));
  assert.equal(ids.includes("learning.enroll"), false);
  assert.equal(ids.includes("learning.purchase"), false);
  assert.equal(ids.includes("speech.live"), false);
});
