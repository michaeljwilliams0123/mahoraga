import test from "node:test";
import assert from "node:assert/strict";
import {
  compoundCreditFreeLearning,
  runCreditFreeHeartbeat,
  validateHeartbeatReceipt,
} from "../src/autonomy-heartbeat.mjs";
import { CREDIT_FREE_PROTOCOL_STEPS } from "../src/credit-free-autonomy.mjs";
import { buildAutonomyObjective } from "../src/autonomy-orchestrator.mjs";
import { runCloudCycle } from "../src/cloud-cycle-worker.mjs";

const NOW = new Date("2026-09-05T08:00:00.000Z");
const EXECUTION_CONTRACT = Object.freeze({
  baseCommit: "a".repeat(40),
  allowedPaths: Object.freeze(["src", "test"]),
});

test("unattended heartbeat runs the inspect protocol at $0 without a user prompt", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    world: { head: "a".repeat(40), workerIds: ["repository", "self-healer"], openIssues: 2, openPulls: 1 },
  });
  assert.equal(receipt.kind, "credit-free-heartbeat");
  assert.equal(receipt.intentKind, "inspect");
  assert.equal(receipt.nextAction, "dispatch-credit-free");
  assert.equal(receipt.executable, true);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.deepEqual(receipt.steps.map((step) => step.id), ["observe", "decide", "report"]);
  assert.equal(receipt.steps.every((step) => step.status === "admissible"), true);
  assert.match(receipt.worldDigest, /^[a-f0-9]{64}$/);
  assert.equal(validateHeartbeatReceipt(receipt), receipt);
});

test("heartbeat never recovers through paid, metered, or key-backed routes", () => {
  const refused = runCreditFreeHeartbeat({ now: NOW, allowPaidFallback: true });
  assert.equal(refused.nextAction, "refuse-paid-route");
  assert.equal(refused.executable, false);
  assert.equal(refused.paidFallback, false);
  assert.equal(refused.health.reason, "paid-fallback-forbidden");

  const metered = runCreditFreeHeartbeat({ now: NOW, requestedProvider: "openai-platform" });
  assert.equal(metered.nextAction, "refuse-paid-route");
  assert.equal(metered.plane.reason, "metered-provider-forbidden");

  const keyed = runCreditFreeHeartbeat({ now: NOW, platformApiKeyPresent: true });
  assert.equal(keyed.nextAction, "refuse-paid-route");
  assert.equal(keyed.health.reason, "platform-api-key-present");
});

test("generation heartbeats keep containment and record a steward gap until a local reasoner is live", () => {
  const waiting = runCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    message: "Update the Mahoraga interface and apply the change",
  });
  assert.equal(waiting.intentKind, "autonomous-action");
  assert.deepEqual(waiting.steps.map((step) => step.id), [...CREDIT_FREE_PROTOCOL_STEPS]);
  assert.equal(waiting.stewardGap.id, "credit-free-deferred-implementation");
  assert.equal(waiting.stewardGap.paidFallback, false);

  const ready = runCreditFreeHeartbeat({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    message: "Update the Mahoraga interface and apply the change",
  });
  assert.equal(ready.stewardGap, null);
  assert.equal(ready.nextAction, "dispatch-credit-free");
});

test("compounded learning stores method identifiers and counts, never prompts", () => {
  const first = runCreditFreeHeartbeat({ now: NOW, world: { openIssues: 2 } });
  const second = runCreditFreeHeartbeat({ now: NOW, localReasonerReady: false, requestedProvider: "ollama" });
  const learning = compoundCreditFreeLearning([first, second]);
  assert.equal(learning.zeroCredit, true);
  assert.equal(learning.heartbeatCount, 2);
  assert.deepEqual([...learning.methodIds], [...CREDIT_FREE_PROTOCOL_STEPS]);
  assert.equal(learning.nextActions["dispatch-credit-free"], 1);
  assert.equal(learning.nextActions["wait-for-local-reasoner"], 1);
  assert.equal(learning.gaps[0].id, "heartbeat-local-reasoner-gap");
  assert.equal(JSON.stringify(learning).includes("prompt"), false);
  assert.equal(JSON.stringify(learning).includes("Update the"), false);
  assert.equal(learning.creditCost, 0);
  assert.throws(() => compoundCreditFreeLearning([{ ...first, creditCost: 1 }]), /heartbeat-paid-contamination/);
});

test("credit-free objectives honor live local-reasoner evidence instead of defaulting to a steward gap", () => {
  const deferred = buildAutonomyObjective({
    conversationId: "con-00000000-0000-0000-0000-000000000000",
    messageId: "msg-00000000-0000-0000-0000-000000000000",
    message: "Update the interface and apply the change",
    requestedMode: "credit-free",
    creditFreeRequired: true,
    executionContract: EXECUTION_CONTRACT,
  });
  assert.equal(deferred.stewardGap.id, "credit-free-deferred-implementation");

  const ready = buildAutonomyObjective({
    conversationId: "con-00000000-0000-0000-0000-000000000000",
    messageId: "msg-00000000-0000-0000-0000-000000000000",
    message: "Update the interface and apply the change",
    requestedMode: "credit-free",
    creditFreeRequired: true,
    executionContract: EXECUTION_CONTRACT,
    creditFreeContext: { localReasonerReady: true },
  });
  assert.equal(ready.stewardGap, null);
  assert.equal(ready.nextAction, "dispatch-credit-free");
  assert.equal(ready.creditCost, 0);
});

test("four-hour cycle holds planned instead of producing when credit-free health is blocked", async () => {
  const held = await runCloudCycle({
    repositoryIdentity: "owner/repo",
    providers: [],
    requiresGeneration: false,
    cloudModeEnabled: false,
    now: NOW,
    creditFree: { vercelDeploymentsToday: 100, vercelDailyCap: 100 },
    candidateProducer: async () => ({
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      branch: "feature/mahoraga-auto-example",
      pullRequestNumber: 91,
      changedFilesDigest: "c".repeat(64),
    }),
  });
  assert.equal(held.status, "waiting");
  assert.equal(held.terminalReason, "hold-planned");
  assert.equal(held.candidate, null);
  assert.equal(held.heartbeat.nextAction, "hold-planned");
  assert.equal(held.heartbeat.paidFallback, false);
});

test("four-hour cycle workflow runs the credit-free heartbeat before candidate production", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { ROOT } = await import("../src/config.mjs");
  const source = await readFile(path.join(ROOT, ".github", "workflows", "sovereign-eight-hour-cycle.yml"), "utf8");
  assert.match(source, /Credit-free heartbeat preflight/);
  assert.match(source, /node src\/autonomy-heartbeat\.mjs/);
  assert.match(source, /refuse-paid-route/);
  assert.match(source, /node src\/cloud-cycle-worker\.mjs/);
});
