import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCreditFreeHeartbeat } from "../src/autonomy-heartbeat.mjs";
import { asHeartbeatCliReceipt, runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";
import { CREDIT_FREE_PROTOCOL_STEPS } from "../src/credit-free-autonomy.mjs";
import { createEvolutionExperiment } from "../src/evolution-laboratory.mjs";

const NOW = new Date("2026-09-05T14:00:00.000Z");
const ROOT = fileURLToPath(new URL("..", import.meta.url));

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
  assert.equal(receipt.unattended.fleet.kind, "unattended-foundry-fleet");
  assert.ok(receipt.unattended.fleet.admittedCount >= 1);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
});

test("heartbeat CLI exits cleanly without an unsettled top-level-await cycle", () => {
  const result = spawnSync(process.execPath, ["src/autonomy-heartbeat.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      MAHORAGA_LOCAL_REASONER_READY: "false",
      MAHORAGA_PLATFORM_API_KEY_PRESENT: "false",
      MAHORAGA_ALLOW_PAID_FALLBACK: "false",
    },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 13, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.kind, "credit-free-heartbeat");
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.equal(receipt.unattended.kind, "unattended-credit-free-cycle");
  assert.equal(receipt.unattended.generationAdmit.kind, "unattended-generation-admit");
  assert.equal(receipt.unattended.generationAdmit.requiresGeneration, false);
  assert.equal(receipt.unattended.generationAdmit.creditCost, 0);
  assert.equal(receipt.unattended.generationAdmit.paidFallback, false);
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

test("foundry admission is identifier-only and still zero-credit", () => {
  const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2 } });
  assert.equal(cycle.fleet.kind, "unattended-foundry-fleet");
  assert.equal(cycle.fleet.creditCost, 0);
  assert.equal(cycle.fleet.paidFallback, false);
  assert.ok(cycle.fleet.admittedAgentIds.includes("mahoraga-heartbeat-destiny-trigger-not-ready-specialist"));
  assert.equal(JSON.stringify(cycle.fleet).includes("prompt"), false);
});



test("unattended cycle emits one bounded Entity Heartbeat from existing cycle outputs", () => {
  const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2, openPulls: 1 } });
  assert.equal(cycle.entityHeartbeat.kind, "entity-heartbeat-receipt");
  assert.equal(cycle.entityHeartbeat.worldDigest, cycle.heartbeat.worldDigest);
  assert.equal(cycle.entityHeartbeat.objectiveCount, cycle.growth.objectives.length);
  assert.equal(cycle.entityHeartbeat.activeMemoryCount, cycle.growth.memory.activeMemoryIds.length);
  assert.equal(cycle.entityHeartbeat.dispatchCount, cycle.fleet.admittedCount);
  assert.equal(cycle.entityHeartbeat.researchCount, 0);
  assert.equal(cycle.entityHeartbeat.creditCost, 0);
  assert.equal(cycle.entityHeartbeat.paidFallback, false);
  const receipt = asHeartbeatCliReceipt(cycle);
  assert.equal(receipt.unattended.entityHeartbeat.fingerprint, cycle.entityHeartbeat.fingerprint);
});

test("unattended Entity Heartbeat carries stable-world evidence across cycles", () => {
  const first = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2 } });
  const second = runUnattendedCreditFreeCycle({
    now: NOW,
    world: { openIssues: 2 },
    priorEntityHeartbeat: first.entityHeartbeat,
  });
  assert.equal(second.entityHeartbeat.previousWorldDigest, first.entityHeartbeat.worldDigest);
  assert.equal(second.entityHeartbeat.materialDelta, false);
});

test("unattended cycle evaluates isolated experiments without activating them", () => {
  const experiment = createEvolutionExperiment({
    experimentId: "exp-unattended-closure",
    objectiveId: "obj-unattended-closure",
    hypothesis: "The entity receipt can observe the current unattended loop without creating a second scheduler.",
    baselineMetric: 0.5,
    candidateMetric: 0.8,
    verification: "contract-suite",
    isolated: true,
  }, { observedAt: NOW.toISOString() });
  const cycle = runUnattendedCreditFreeCycle({
    now: NOW,
    world: { openIssues: 1 },
    evolutionExperiments: [{ experiment, verificationSatisfied: true }],
  });
  assert.equal(cycle.entityHeartbeat.evolutionExperimentCount, 1);
  assert.equal(cycle.entityHeartbeat.evolutionGraduationReadyCount, 1);
  assert.equal(cycle.entityHeartbeat.providerRequired, false);
  assert.equal(cycle.entityHeartbeat.creditCost, 0);
});