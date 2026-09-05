import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { applyAgentFoundryPlans, validateChildAgentManifest } from "./agent-foundry.mjs";
import { appendHeartbeatReceipt, createHeartbeatLedger } from "./heartbeat-ledger.mjs";
import { emptyFoundryRegistry, snapshotFoundryFleet } from "./unattended-foundry-admit.mjs";

export const UNATTENDED_CYCLE_MEMORY_KIND = "unattended-cycle-memory";
export const UNATTENDED_CYCLE_MEMORY_SCHEMA_VERSION = 1;
export const UNATTENDED_CYCLE_MEMORY_RELATIVE = "state/unattended-cycle-memory.json";
export const HEARTBEAT_LEDGER_RELATIVE = "state/heartbeat-ledger.json";
export const UNATTENDED_CYCLE_MEMORY_CACHE = Object.freeze({
  kind: "unattended-cycle-memory-cache",
  schemaVersion: 1,
  action: "actions/cache",
  pin: "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  version: "v6.1.0",
  keyPrefix: "unattended-cycle-memory-v1",
  restoreStepName: "Restore unattended cycle memory",
  paths: Object.freeze([UNATTENDED_CYCLE_MEMORY_RELATIVE, HEARTBEAT_LEDGER_RELATIVE]),
  creditCost: 0,
  paidFallback: false,
  gitWrite: false,
});
const UNATTENDED_CYCLE_KIND = "unattended-credit-free-cycle";

const FORBIDDEN_CONTENT_KEYS = new Set(["prompt", "response", "content", "messages", "chat"]);

export function emptyUnattendedCycleMemory(parentAgentId = "mahoraga") {
  const registry = emptyFoundryRegistry(parentAgentId);
  return freezeMemory({
    parentAgentId,
    receipts: [],
    registry,
    lastObservedAt: null,
  });
}

export function resolveUnattendedCycleMemoryPath({ root = ROOT, env = process.env } = {}) {
  if (typeof env?.MAHORAGA_CYCLE_MEMORY_PATH === "string" && env.MAHORAGA_CYCLE_MEMORY_PATH.trim()) {
    return path.resolve(env.MAHORAGA_CYCLE_MEMORY_PATH);
  }
  return path.join(root, UNATTENDED_CYCLE_MEMORY_RELATIVE);
}

export function resolveHeartbeatLedgerPath({ root = ROOT, env = process.env } = {}) {
  if (typeof env?.MAHORAGA_HEARTBEAT_LEDGER_PATH === "string" && env.MAHORAGA_HEARTBEAT_LEDGER_PATH.trim()) {
    return path.resolve(env.MAHORAGA_HEARTBEAT_LEDGER_PATH);
  }
  return path.join(root, HEARTBEAT_LEDGER_RELATIVE);
}

export function validateUnattendedCycleMemory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("unattended-memory-invalid");
  if (value.kind !== UNATTENDED_CYCLE_MEMORY_KIND || value.schemaVersion !== UNATTENDED_CYCLE_MEMORY_SCHEMA_VERSION) {
    fail("unattended-memory-invalid");
  }
  if (value.creditCost !== 0 || value.paidFallback !== false) fail("unattended-paid-contamination");
  assertContentFree(value);
  if (typeof value.parentAgentId !== "string") fail("unattended-memory-parent-invalid");
  if (!Array.isArray(value.receipts) || value.receipts.length > 256) fail("unattended-memory-receipts-invalid");
  const ledger = createHeartbeatLedger(value.receipts);
  const registry = normalizeRegistry(value.registry, value.parentAgentId);
  if (registry.parentAgentId !== value.parentAgentId) fail("unattended-memory-parent-mismatch");
  if (value.lastObservedAt != null && value.lastObservedAt !== ledger.lastObservedAt && ledger.lastObservedAt != null) {
    if (typeof value.lastObservedAt !== "string" || new Date(value.lastObservedAt).toISOString() !== value.lastObservedAt) {
      fail("unattended-memory-observed-at-invalid");
    }
  }
  return freezeMemory({
    parentAgentId: value.parentAgentId,
    receipts: [...ledger.receipts],
    registry,
    lastObservedAt: ledger.lastObservedAt ?? value.lastObservedAt ?? null,
  });
}

export function rememberUnattendedCycle(memory, cycle) {
  if (!cycle || cycle.kind !== UNATTENDED_CYCLE_KIND) fail("unattended-cycle-invalid");
  if (cycle.creditCost !== 0 || cycle.paidFallback !== false) fail("unattended-paid-contamination");
  if (!cycle.heartbeat || !cycle.fleet || !cycle.registry) fail("unattended-cycle-invalid");
  const parentAgentId = cycle.fleet.parentAgentId;
  const current = memory == null
    ? emptyUnattendedCycleMemory(parentAgentId)
    : validateUnattendedCycleMemory(memory);
  if (current.receipts.length > 0 && current.parentAgentId !== parentAgentId) fail("unattended-memory-parent-mismatch");
  const receipts = [...current.receipts];
  appendHeartbeatReceipt(receipts, cycle.heartbeat);
  const registry = normalizeRegistry(cycle.registry, parentAgentId);
  return freezeMemory({
    parentAgentId,
    receipts,
    registry,
    lastObservedAt: cycle.observedAt,
  });
}

export function mergeFoundryCoverage(gitRegistry, memory) {
  const current = memory == null ? emptyUnattendedCycleMemory() : validateUnattendedCycleMemory(memory);
  if (gitRegistry == null) return current.registry;
  if (!gitRegistry || gitRegistry.schemaVersion !== 1 || !Array.isArray(gitRegistry.agents)) fail("agent-registry-invalid");
  if (current.registry.agents.length === 0) return applyAgentFoundryPlans(gitRegistry, []);
  if (gitRegistry.parentAgentId !== current.parentAgentId) return applyAgentFoundryPlans(gitRegistry, []);
  const plans = current.registry.agents.map((agent) => Object.freeze({
    schemaVersion: 1,
    gapId: agent.capabilities[0],
    priority: "medium",
    manifest: agent,
  }));
  return applyAgentFoundryPlans(gitRegistry, plans);
}

export function summarizeUnattendedCycleMemory(memory, { persisted = false } = {}) {
  const current = memory == null ? emptyUnattendedCycleMemory() : validateUnattendedCycleMemory(memory);
  return Object.freeze({
    kind: current.kind,
    schemaVersion: current.schemaVersion,
    parentAgentId: current.parentAgentId,
    receiptCount: current.receipts.length,
    agentCount: current.registry.agents.length,
    lastObservedAt: current.lastObservedAt,
    persisted: persisted === true,
    creditCost: 0,
    paidFallback: false,
  });
}

export async function loadUnattendedCycleMemory({ root = ROOT, env = process.env } = {}) {
  const file = resolveUnattendedCycleMemoryPath({ root, env });
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    return validateUnattendedCycleMemory(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyUnattendedCycleMemory();
    throw error;
  }
}

export async function saveUnattendedCycleMemory(memory, { root = ROOT, env = process.env } = {}) {
  const current = validateUnattendedCycleMemory(memory);
  const file = resolveUnattendedCycleMemoryPath({ root, env });
  await writeAtomicJson(file, current);
  const ledgerFile = resolveHeartbeatLedgerPath({ root, env });
  await writeAtomicJson(ledgerFile, createHeartbeatLedger(current.receipts));
  return summarizeUnattendedCycleMemory(current, { persisted: true });
}

export function workflowWiresSchedulerMemoryCache(source) {
  if (typeof source !== "string" || source.length === 0) return false;
  const cache = UNATTENDED_CYCLE_MEMORY_CACHE;
  if (cache.creditCost !== 0 || cache.paidFallback !== false || cache.gitWrite !== false) return false;
  const restoreCount = source.split(cache.restoreStepName).length - 1;
  return source.includes(`actions/cache@${cache.pin}`)
    && source.includes(`# ${cache.version}`)
    && source.includes(cache.keyPrefix)
    && source.includes("github.run_id")
    && source.includes("restore-keys:")
    && cache.paths.every((relative) => source.includes(relative))
    && restoreCount >= 2;
}

function normalizeRegistry(registry, parentAgentId) {
  const base = registry == null ? emptyFoundryRegistry(parentAgentId) : registry;
  const validated = applyAgentFoundryPlans({
    schemaVersion: 1,
    parentAgentId: base.parentAgentId,
    agents: (base.agents ?? []).map((agent) => validateChildAgentManifest(agent)),
  }, []);
  if (validated.parentAgentId !== parentAgentId) fail("unattended-memory-parent-mismatch");
  return validated;
}

function freezeMemory({ parentAgentId, receipts, registry, lastObservedAt }) {
  const fleet = snapshotFoundryFleet(registry, []);
  return Object.freeze({
    schemaVersion: UNATTENDED_CYCLE_MEMORY_SCHEMA_VERSION,
    kind: UNATTENDED_CYCLE_MEMORY_KIND,
    parentAgentId,
    receipts: Object.freeze([...receipts]),
    registry,
    fleet,
    lastObservedAt,
    creditCost: 0,
    paidFallback: false,
  });
}

function assertContentFree(value) {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertContentFree(item);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_CONTENT_KEYS.has(key)) fail("unattended-memory-content-forbidden");
    assertContentFree(item);
  }
}

async function writeAtomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
