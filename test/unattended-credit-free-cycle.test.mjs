import test from "node:test";
import assert from "node:assert/strict";
import { runCreditFreeHeartbeat } from "../src/autonomy-heartbeat.mjs";
import { asHeartbeatCliReceipt, runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";
import { CREDIT_FREE_PROTOCOL_STEPS } from "../src/credit-free-autonomy.mjs";

const NOW = new Date("2026-09-05T14:00:00.000Z");

test("unattended cycle runs heartbeat then compounds skills at $0 without a chat turn", () => {
  const cycle = runUnattendedCreditFreeCycle({
    now: NOW,
    world: { openIssues: 2, openPulls: 1 },
  });
  assert.equal(cycle.kind, "unattended-credit-free-cycle");
  assert.equal(cycle.fastLoop, "heartbeat");
  assert.equal(cycle.slowLoop, "skill-compound-and-foundry");
  assert.equal(cycle.nextAction, "dispatch-credit-free");
  assert.equal(cycle.heartbeat.intentKind, "inspect");
  assert.equal(cycle.generation, null);
  assert.equal(cycle.heartbeat.destinyTrigger.ready, false);
  assert.ok(cycle.improvement.foundryPlanCount >= 1);
  assert.equal(cycle.ledger.heartbeatCount, 1);
  assert.equal(cycle.creditCost, 0);
  assert.equal(cycle.paidFallback, false);
  assert.deepEqual([...cycle.improvement.methodIds], [...CREDIT_FREE_PROTOCOL_STEPS]);
});

test("generation cycles hold without a live invoke and still run the slow foundry loop", () => {
  const cycle = runUnattendedCreditFreeCycle({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    message: "Update the Mahoraga interface and apply the change",
    world: { openIssues: 1 },
  });
  assert.equal(cycle.heartbeat.intentKind, "autonomous-action");
  assert.equal(cycle.generation.status, "hold");
  assert.equal(cycle.generation.reason, "generation-invoke-required");
  assert.notEqual(cycle.generation.status, "ok");
  assert.equal(cycle.creditCost, 0);
  assert.equal(cycle.paidFallback, false);
});

test("holds and refusals still compound identifier-only foundry plans", () => {
  const prior = [
    runCreditFreeHeartbeat({ now: NOW, providers: ["ollama"], world: { openIssues: 1 } }),
    runCreditFreeHeartbeat({ now: new Date("2026-09-05T14:01:00.000Z"), allowPaidFallback: true, world: { openIssues: 1 } }),
  ];
  const cycle = runUnattendedCreditFreeCycle({
    now: new Date("2026-09-05T14:02:00.000Z"),
    priorReceipts: prior,
    world: { openIssues: 1 },
  });
  assert.ok(cycle.improvement.foundryPlanCount >= 1);
  assert.equal(cycle.ledger.heartbeatCount, 3);
  assert.equal(JSON.stringify(cycle).includes("prompt"), false);
  assert.equal(JSON.stringify(cycle).includes("User request"), false);
});

test("CLI receipt keeps heartbeat nextAction at the root for the Actions parser", () => {
  const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 0 } });
  const receipt = asHeartbeatCliReceipt(cycle);
  assert.equal(receipt.kind, "credit-free-heartbeat");
  assert.equal(receipt.nextAction, cycle.nextAction);
  assert.equal(receipt.unattended.kind, "unattended-credit-free-cycle");
  assert.equal(receipt.unattended.slowLoop, "skill-compound-and-foundry");
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
});

test("a real invoke may verify generation without persisting content", () => {
  const cycle = runUnattendedCreditFreeCycle({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    probe: { verified: true },
    invoke: ({ worldDigest }) => ({ status: "ok", resultSha256: worldDigest }),
    message: "Update the Mahoraga interface",
  });
  assert.equal(cycle.generation.status, "ok");
  assert.equal(cycle.generation.reason, "loopback-generate-verified");
  assert.equal(JSON.stringify(cycle.generation).includes("prompt"), false);
});

test("async invoke is awaited without fabricating an ok result", async () => {
  const cycle = await runUnattendedCreditFreeCycle({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    probe: { verified: true },
    invoke: async ({ worldDigest }) => ({ status: "ok", resultSha256: worldDigest }),
    message: "Update the Mahoraga interface",
  });
  assert.equal(cycle.generation.status, "ok");
  assert.equal(cycle.generation.paidFallback, false);
});
