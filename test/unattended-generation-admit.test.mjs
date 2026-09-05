import test from "node:test";
import assert from "node:assert/strict";
import {
  decideUnattendedGeneration,
  envGenerationExplicit,
  UNATTENDED_GENERATION_ADMIT_KIND,
} from "../src/unattended-generation-admit.mjs";

test("unset explicit and a dead probe stay inspect-only", () => {
  const admit = decideUnattendedGeneration({ probe: { verified: false } });
  assert.equal(admit.kind, UNATTENDED_GENERATION_ADMIT_KIND);
  assert.equal(admit.requiresGeneration, false);
  assert.equal(admit.armed, false);
  assert.equal(admit.nextAction, "wait-for-local-reasoner");
  assert.equal(admit.reason, "wait-for-local-reasoner");
  assert.equal(admit.creditCost, 0);
  assert.equal(admit.paidFallback, false);
});

test("a live loopback probe auto-arms generation without a chat turn", () => {
  const admit = decideUnattendedGeneration({ probe: { verified: true } });
  assert.equal(admit.requiresGeneration, true);
  assert.equal(admit.armed, true);
  assert.equal(admit.reason, "loopback-reasoner-live");
  assert.equal(admit.nextAction, "dispatch-credit-free");
  assert.equal(JSON.stringify(admit).includes("prompt"), false);
});

test("explicit inspect-only wins over a live probe (four-hour Actions cycle)", () => {
  const admit = decideUnattendedGeneration({ explicit: false, probe: { verified: true } });
  assert.equal(admit.requiresGeneration, false);
  assert.equal(admit.reason, "inspect-only-explicit");
});

test("explicit generation still arms when the probe is missing", () => {
  const admit = decideUnattendedGeneration({ explicit: true, probe: null });
  assert.equal(admit.requiresGeneration, true);
  assert.equal(admit.reason, "generation-explicit");
});

test("paid contamination never arms generation", () => {
  assert.equal(decideUnattendedGeneration({
    probe: { verified: true },
    allowPaidFallback: true,
  }).reason, "paid-fallback-forbidden");
  assert.equal(decideUnattendedGeneration({
    probe: { verified: true },
    spendGrantUsd: 1,
  }).reason, "spend-grant-not-zero");
  assert.equal(decideUnattendedGeneration({
    probe: { verified: true },
    platformApiKeyPresent: true,
  }).reason, "platform-api-key-present");
  assert.equal(decideUnattendedGeneration({
    probe: { verified: true, cloudTagged: true },
  }).reason, "ollama-cloud-not-credit-free");
});

test("env tri-state distinguishes unset auto-arm from explicit inspect", () => {
  assert.equal(envGenerationExplicit(undefined), null);
  assert.equal(envGenerationExplicit(""), null);
  assert.equal(envGenerationExplicit("1"), true);
  assert.equal(envGenerationExplicit("true"), true);
  assert.equal(envGenerationExplicit("0"), false);
  assert.equal(envGenerationExplicit("false"), false);
});

test("content keys fail closed", () => {
  const admit = decideUnattendedGeneration({ probe: { verified: true } });
  assert.equal("prompt" in admit, false);
  assert.equal("response" in admit, false);
  assert.equal("messages" in admit, false);
});
