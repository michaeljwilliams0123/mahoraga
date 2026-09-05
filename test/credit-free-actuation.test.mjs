import test from "node:test";
import assert from "node:assert/strict";
import { actuateCreditFreeCycle, validateActuation } from "../src/credit-free-actuation.mjs";
import { composeCreditFreeHeartbeat, runCreditFreeHeartbeat } from "../src/autonomy-heartbeat.mjs";
import { listTransientResults } from "../src/local-reasoner-channel.mjs";

const NOW = new Date("2026-09-05T08:00:00.000Z");

test("inspect heartbeats actuate by reporting the world digest at $0", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    world: { head: "a".repeat(40), openIssues: 2, openPulls: 1 },
  });
  assert.equal(receipt.actuation.status, "verified");
  assert.equal(receipt.actuation.reason, "inspect-reported");
  assert.equal(receipt.actuation.resultSha256, receipt.worldDigest);
  assert.equal(receipt.actuation.creditCost, 0);
  assert.equal(receipt.actuation.paidFallback, false);
  assert.equal("channelId" in receipt.actuation, false);
  assert.equal(JSON.stringify(receipt.actuation).includes("prompt"), false);
  assert.equal(validateActuation(receipt.actuation), receipt.actuation);
});

test("admitted generation without an execution callback holds and records no fabricated result", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    message: "Update the Mahoraga interface and apply the change",
  });
  assert.equal(receipt.localReasonerExecution.executionEnabled, true);
  assert.equal(receipt.actuation.status, "held");
  assert.equal(receipt.actuation.reason, "generation-callback-required");
  assert.equal(receipt.actuation.resultSha256, receipt.worldDigest);
  assert.equal(listTransientResults(receipt.resultChannel, Date.parse(NOW.toISOString()) + 20).length, 0);
});

test("runCreditFreeHeartbeat forwards a real generation callback and verifies only its content-free digest result", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    message: "Update the Mahoraga interface and apply the change",
    generate: ({ worldDigest }) => ({ status: "ok", resultSha256: worldDigest }),
  });
  assert.equal(receipt.localReasonerExecution.executionEnabled, true);
  assert.equal(receipt.actuation.status, "verified");
  assert.equal(receipt.actuation.reason, "generation-result-verified");
  assert.equal(receipt.actuation.channelId, receipt.resultChannel.id);
  assert.equal(receipt.actuation.resultSha256, receipt.worldDigest);
  assert.equal(listTransientResults(receipt.resultChannel, Date.parse(NOW.toISOString()) + 20).length, 1);
  assert.equal(JSON.stringify(receipt).includes("\"prompt\""), false);
});

test("generation without a live reasoner holds instead of buying a route", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: false,
    message: "Update the Mahoraga interface and apply the change",
  });
  assert.equal(receipt.localReasonerExecution.executionEnabled, false);
  assert.equal(receipt.actuation.status, "held");
  assert.equal(receipt.actuation.reason, "local-reasoner-not-ready");
  assert.equal(receipt.actuation.paidFallback, false);
  assert.equal(receipt.creditCost, 0);
});

test("paid routes refuse actuation and stay at zero credit", () => {
  const receipt = runCreditFreeHeartbeat({ now: NOW, allowPaidFallback: true });
  assert.equal(receipt.nextAction, "refuse-paid-route");
  assert.equal(receipt.actuation.status, "refused");
  assert.equal(receipt.actuation.reason, "refuse-paid-route");
  assert.equal(receipt.actuation.paidFallback, false);
});

test("custom generate callbacks cannot persist prompts and may hold", () => {
  const base = composeCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    message: "Update the Mahoraga interface and apply the change",
  });
  assert.equal(base.actuation, undefined);
  const held = actuateCreditFreeCycle(base, {
    now: Date.parse(NOW.toISOString()) + 5,
    generate: () => ({ status: "hold", resultSha256: base.worldDigest }),
  });
  assert.equal(held.actuation.status, "held");
  assert.equal(held.actuation.reason, "generation-result-unverified");

  assert.throws(
    () => actuateCreditFreeCycle(base, {
      now: Date.parse(NOW.toISOString()) + 6,
      generate: () => ({ status: "ok", resultSha256: base.worldDigest, prompt: "secret" }),
    }),
    /heartbeat-actuation-content-forbidden/,
  );
});
