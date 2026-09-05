import test from "node:test";
import assert from "node:assert/strict";
import { compoundCreditFreeLearning, runCreditFreeHeartbeat } from "../src/autonomy-heartbeat.mjs";
import { reduceHeartbeatLedger } from "../src/heartbeat-ledger.mjs";
import { compoundCreditFreeSkills, runCreditFreeImprovementLoop } from "../src/credit-free-skill-compound.mjs";
import { CREDIT_FREE_PROTOCOL_STEPS } from "../src/credit-free-autonomy.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const LEARNED_AT = "2026-09-05T12:00:00.000Z";

function receipts() {
  const dispatch = runCreditFreeHeartbeat({ now: NOW, world: { openIssues: 1 } });
  const held = runCreditFreeHeartbeat({
    now: new Date("2026-09-05T12:01:00.000Z"),
    providers: ["ollama"],
    world: { openIssues: 1 },
  });
  const refused = runCreditFreeHeartbeat({
    now: new Date("2026-09-05T12:02:00.000Z"),
    allowPaidFallback: true,
    world: { openIssues: 1 },
  });
  return [dispatch, held, refused];
}

test("skill compounding turns heartbeat learning into an identifier-only routine at $0", () => {
  const learning = compoundCreditFreeLearning(receipts());
  const skills = compoundCreditFreeSkills({ learning, learnedAt: LEARNED_AT });
  assert.equal(skills.kind, "credit-free-skill-compound");
  assert.equal(skills.creditCost, 0);
  assert.equal(skills.paidFallback, false);
  assert.equal(skills.zeroCredit, true);
  assert.deepEqual([...skills.methodIds], [...CREDIT_FREE_PROTOCOL_STEPS]);
  assert.equal(skills.routine.capability, "credit-free-protocol");
  assert.equal(skills.routine.agentId, "mahoraga-heartbeat");
  assert.equal(skills.routine.successes, 1);
  assert.equal(skills.dispatchCount, 1);
  assert.equal(JSON.stringify(skills).includes("User request"), false);
  assert.equal(JSON.stringify(skills).includes("prompt"), false);
});

test("the slow improvement loop plans zero-credit specialists from steward gaps and never buys a route", () => {
  const learning = compoundCreditFreeLearning(receipts());
  const loop = runCreditFreeImprovementLoop({ learning, learnedAt: LEARNED_AT });
  assert.equal(loop.fastLoop, "heartbeat");
  assert.equal(loop.slowLoop, "skill-compound-and-foundry");
  assert.equal(loop.creditCost, 0);
  assert.equal(loop.paidFallback, false);
  assert.ok(loop.skills.foundryPlans.length >= 1);
  for (const plan of loop.skills.foundryPlans) {
    assert.equal(plan.manifest.zeroCredit, true);
    assert.equal(plan.manifest.selfUpdate, true);
    assert.equal(plan.manifest.ownerApprovalRequired, false);
  }
});

test("ledger reduction compounds skills without storing chats or paid contamination", () => {
  const ledger = reduceHeartbeatLedger(receipts());
  assert.equal(ledger.skills.kind, "credit-free-skill-compound");
  assert.equal(ledger.skills.creditCost, 0);
  assert.equal(ledger.paidFallback, false);
  assert.throws(
    () => compoundCreditFreeSkills({ learning: { ...ledger.learning, paidFallback: true } }),
    /skill-paid-contamination/,
  );
});

test("existing fleet coverage suppresses re-planning of the same specialist", async () => {
  const { createChildAgentManifest } = await import("../src/agent-foundry.mjs");
  const learning = compoundCreditFreeLearning(receipts());
  const existing = createChildAgentManifest({
    agentId: "mahoraga-heartbeat-destiny-trigger-not-ready-specialist",
    parentAgentId: "mahoraga",
    role: "heartbeat-destiny-trigger-not-ready-specialist",
    mission: "Hold Destiny model-backed dispatch fail-closed until a dedicated actor exists.",
    capabilities: ["heartbeat-destiny-trigger-not-ready"],
    privileges: ["github-read", "github-pr-write"],
  }, { createdAt: LEARNED_AT });
  const uncovered = compoundCreditFreeSkills({ learning, learnedAt: LEARNED_AT });
  const covered = compoundCreditFreeSkills({
    learning,
    learnedAt: LEARNED_AT,
    existingAgents: [existing],
  });
  assert.ok(uncovered.foundryPlans.some((plan) => plan.gapId === "heartbeat-destiny-trigger-not-ready"));
  assert.equal(covered.foundryPlans.some((plan) => plan.gapId === "heartbeat-destiny-trigger-not-ready"), false);
  assert.equal(covered.creditCost, 0);
});
