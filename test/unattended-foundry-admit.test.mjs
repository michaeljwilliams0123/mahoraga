import test from "node:test";
import assert from "node:assert/strict";
import { createChildAgentManifest, planChildAgents } from "../src/agent-foundry.mjs";
import { admitUnattendedFoundry, emptyFoundryRegistry } from "../src/unattended-foundry-admit.mjs";
import { runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";

const NOW = new Date("2026-09-05T14:00:00.000Z");
const CREATED_AT = "2026-09-05T14:00:00.000Z";

test("empty registry admits planned specialists at $0 without writing Git", () => {
  const plans = planChildAgents({
    parentAgentId: "mahoraga",
    existingAgents: [],
    gaps: [{
      id: "heartbeat-destiny-trigger-not-ready",
      state: "open",
      priority: "critical",
      summary: "Destiny remains unconfigured.",
      dependency: "dedicated-actor-or-signed-receipt",
    }],
    createdAt: CREATED_AT,
  });
  const admitted = admitUnattendedFoundry({ parentAgentId: "mahoraga", plans });
  assert.equal(admitted.fleet.kind, "unattended-foundry-fleet");
  assert.equal(admitted.fleet.admittedCount, 1);
  assert.equal(admitted.fleet.agentCount, 1);
  assert.equal(admitted.fleet.admittedAgentIds[0], "mahoraga-heartbeat-destiny-trigger-not-ready-specialist");
  assert.equal(admitted.fleet.creditCost, 0);
  assert.equal(admitted.fleet.paidFallback, false);
  assert.equal(admitted.registry.agents[0].zeroCredit, true);
  assert.equal(JSON.stringify(admitted.fleet).includes("prompt"), false);
});

test("covered capabilities are not re-admitted", () => {
  const existing = createChildAgentManifest({
    agentId: "mahoraga-heartbeat-destiny-trigger-not-ready-specialist",
    parentAgentId: "mahoraga-steward",
    role: "heartbeat-destiny-trigger-not-ready-specialist",
    mission: "Hold Destiny model-backed dispatch fail-closed until a dedicated actor exists.",
    capabilities: ["heartbeat-destiny-trigger-not-ready"],
    privileges: ["github-read", "github-pr-write"],
  }, { createdAt: CREATED_AT });
  const registry = { schemaVersion: 1, parentAgentId: "mahoraga-steward", agents: [existing] };
  const plans = planChildAgents({
    parentAgentId: "mahoraga-steward",
    existingAgents: [existing],
    gaps: [{
      id: "heartbeat-destiny-trigger-not-ready",
      state: "open",
      priority: "critical",
      summary: "Destiny remains unconfigured.",
      dependency: "dedicated-actor-or-signed-receipt",
    }],
    createdAt: CREATED_AT,
  });
  const admitted = admitUnattendedFoundry({ registry, parentAgentId: "mahoraga-steward", plans });
  assert.equal(plans.length, 0);
  assert.equal(admitted.fleet.admittedCount, 0);
  assert.equal(admitted.fleet.agentCount, 1);
});

test("unattended cycles admit the Destiny unreadiness specialist into an ephemeral fleet", () => {
  const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2 } });
  assert.ok(cycle.fleet.admittedCount >= 1);
  assert.ok(cycle.fleet.admittedAgentIds.includes("mahoraga-heartbeat-destiny-trigger-not-ready-specialist"));
  assert.equal(cycle.fleet.creditCost, 0);
  assert.equal(cycle.fleet.paidFallback, false);
  assert.equal(cycle.improvement.foundryPlanCount, cycle.fleet.admittedCount);
});

test("a live registry covering the Destiny gap admits nothing new", () => {
  const existing = createChildAgentManifest({
    agentId: "mahoraga-heartbeat-destiny-trigger-not-ready-specialist",
    parentAgentId: "mahoraga-steward",
    role: "heartbeat-destiny-trigger-not-ready-specialist",
    mission: "Hold Destiny model-backed dispatch fail-closed until a dedicated actor exists.",
    capabilities: ["heartbeat-destiny-trigger-not-ready"],
    privileges: ["github-read", "github-pr-write"],
  }, { createdAt: CREATED_AT });
  const cycle = runUnattendedCreditFreeCycle({
    now: NOW,
    world: { openIssues: 2 },
    foundryRegistry: { schemaVersion: 1, parentAgentId: "mahoraga-steward", agents: [existing] },
  });
  assert.equal(cycle.improvement.foundryPlanCount, 0);
  assert.equal(cycle.fleet.admittedCount, 0);
  assert.equal(cycle.fleet.parentAgentId, "mahoraga-steward");
  assert.equal(cycle.fleet.agentCount, 1);
});

test("emptyFoundryRegistry is identifier-only and zero-credit", () => {
  const registry = emptyFoundryRegistry("mahoraga");
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.agents.length, 0);
  assert.throws(() => emptyFoundryRegistry("Mahoraga"), /foundry-parent-invalid/);
});
