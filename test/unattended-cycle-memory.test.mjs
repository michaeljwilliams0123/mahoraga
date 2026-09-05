import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createChildAgentManifest } from "../src/agent-foundry.mjs";
import { runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";
import {
  emptyUnattendedCycleMemory,
  loadUnattendedCycleMemory,
  mergeFoundryCoverage,
  rememberUnattendedCycle,
  saveUnattendedCycleMemory,
  summarizeUnattendedCycleMemory,
  UNATTENDED_CYCLE_MEMORY_CACHE,
  UNATTENDED_CYCLE_MEMORY_KIND,
  validateUnattendedCycleMemory,
  workflowWiresSchedulerMemoryCache,
} from "../src/unattended-cycle-memory.mjs";

const NOW = new Date("2026-09-05T15:00:00.000Z");
const LATER = new Date("2026-09-05T15:04:00.000Z");
const CREATED_AT = "2026-09-05T15:00:00.000Z";

function tempEnv() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mahoraga-cycle-memory-"));
  return {
    dir,
    env: {
      MAHORAGA_CYCLE_MEMORY_PATH: path.join(dir, "unattended-cycle-memory.json"),
      MAHORAGA_HEARTBEAT_LEDGER_PATH: path.join(dir, "heartbeat-ledger.json"),
    },
  };
}

test("missing memory file loads empty and stays at $0", async () => {
  const { dir, env } = tempEnv();
  try {
    const memory = await loadUnattendedCycleMemory({ env });
    assert.equal(memory.kind, UNATTENDED_CYCLE_MEMORY_KIND);
    assert.equal(memory.receipts.length, 0);
    assert.equal(memory.registry.agents.length, 0);
    assert.equal(memory.creditCost, 0);
    assert.equal(memory.paidFallback, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("remembering a cycle persists receipts and admitted specialists outside Git", async () => {
  const { dir, env } = tempEnv();
  try {
    const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2 } });
    const remembered = rememberUnattendedCycle(null, cycle);
    assert.equal(remembered.receipts.length, 1);
    assert.ok(remembered.registry.agents.length >= 1);
    assert.ok(remembered.registry.agents.some((agent) => agent.agentId.includes("destiny-trigger-not-ready")));
    const summary = await saveUnattendedCycleMemory(remembered, { env });
    assert.equal(summary.persisted, true);
    assert.equal(summary.receiptCount, 1);
    assert.equal(JSON.stringify(remembered).includes("prompt"), false);
    const raw = JSON.parse(readFileSync(env.MAHORAGA_CYCLE_MEMORY_PATH, "utf8"));
    assert.equal(raw.kind, UNATTENDED_CYCLE_MEMORY_KIND);
    const ledger = JSON.parse(readFileSync(env.MAHORAGA_HEARTBEAT_LEDGER_PATH, "utf8"));
    assert.equal(ledger.heartbeatCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a later cycle reuses persisted coverage and does not re-admit the same specialist", async () => {
  const first = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 2 } });
  const memory = rememberUnattendedCycle(null, first);
  const second = runUnattendedCreditFreeCycle({
    now: LATER,
    world: { openIssues: 2 },
    priorReceipts: memory.receipts,
    foundryRegistry: memory.registry,
  });
  assert.equal(second.fleet.admittedCount, 0);
  assert.ok(second.fleet.agentCount >= 1);
  assert.equal(second.ledger.heartbeatCount, 2);
  const compounded = rememberUnattendedCycle(memory, second);
  assert.equal(compounded.receipts.length, 2);
  assert.equal(compounded.registry.agents.length, memory.registry.agents.length);
});

test("Git registry coverage merges persisted specialists without writing Git", () => {
  const existing = createChildAgentManifest({
    agentId: "mahoraga-heartbeat-destiny-trigger-not-ready-specialist",
    parentAgentId: "mahoraga-steward",
    role: "heartbeat-destiny-trigger-not-ready-specialist",
    mission: "Hold Destiny model-backed dispatch fail-closed until a dedicated actor exists.",
    capabilities: ["heartbeat-destiny-trigger-not-ready"],
    privileges: ["github-read", "github-pr-write"],
  }, { createdAt: CREATED_AT });
  const gitRegistry = { schemaVersion: 1, parentAgentId: "mahoraga-steward", agents: [existing] };
  const extra = createChildAgentManifest({
    agentId: "mahoraga-heartbeat-held-without-dispatch-specialist",
    parentAgentId: "mahoraga-steward",
    role: "heartbeat-held-without-dispatch-specialist",
    mission: "Keep held work planned at zero credit.",
    capabilities: ["heartbeat-held-without-dispatch"],
    privileges: ["github-read", "github-pr-write"],
  }, { createdAt: CREATED_AT });
  const memory = validateUnattendedCycleMemory({
    ...emptyUnattendedCycleMemory("mahoraga-steward"),
    registry: { schemaVersion: 1, parentAgentId: "mahoraga-steward", agents: [extra] },
    fleet: { schemaVersion: 1, kind: "unattended-foundry-fleet", parentAgentId: "mahoraga-steward", agentCount: 1, admittedCount: 0, admittedAgentIds: [], agentIds: [extra.agentId], creditCost: 0, paidFallback: false },
  });
  const merged = mergeFoundryCoverage(gitRegistry, memory);
  const ids = merged.agents.map((agent) => agent.agentId).sort();
  assert.deepEqual(ids, [existing.agentId, extra.agentId].sort());
});

test("paid contamination and prompt keys fail closed", () => {
  const cycle = runUnattendedCreditFreeCycle({ now: NOW, world: { openIssues: 1 } });
  const memory = rememberUnattendedCycle(null, cycle);
  assert.throws(() => validateUnattendedCycleMemory({ ...memory, creditCost: 1 }), /unattended-paid-contamination/);
  assert.throws(() => validateUnattendedCycleMemory({ ...memory, prompt: "secret" }), /unattended-memory-content-forbidden/);
  assert.throws(() => rememberUnattendedCycle(memory, { ...cycle, paidFallback: true }), /unattended-paid-contamination/);
  assert.equal(summarizeUnattendedCycleMemory(memory).receiptCount, 1);
});

test("scheduler cache contract stays content-free and refuses Git writes", () => {
  assert.equal(UNATTENDED_CYCLE_MEMORY_CACHE.creditCost, 0);
  assert.equal(UNATTENDED_CYCLE_MEMORY_CACHE.paidFallback, false);
  assert.equal(UNATTENDED_CYCLE_MEMORY_CACHE.gitWrite, false);
  assert.equal(UNATTENDED_CYCLE_MEMORY_CACHE.action, "actions/cache");
  assert.ok(UNATTENDED_CYCLE_MEMORY_CACHE.paths.includes("state/unattended-cycle-memory.json"));
  assert.ok(UNATTENDED_CYCLE_MEMORY_CACHE.paths.includes("state/heartbeat-ledger.json"));
  assert.equal(workflowWiresSchedulerMemoryCache(""), false);
  assert.equal(workflowWiresSchedulerMemoryCache("actions/cache@v4"), false);
});

test("four-hour cycle restores cycle memory from Actions cache on both jobs", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { ROOT } = await import("../src/config.mjs");
  const source = await readFile(path.join(ROOT, ".github", "workflows", "sovereign-eight-hour-cycle.yml"), "utf8");
  assert.equal(workflowWiresSchedulerMemoryCache(source), true);
  assert.match(source, /unattended-cycle-memory-v1-\$\{\{ runner\.os \}\}-\$\{\{ github\.repository \}\}-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(source, /paidFallback:\s*true/);
  assert.doesNotMatch(source, /git add state\/unattended-cycle-memory\.json/);
});
