import { runCreditFreeHeartbeat } from "./autonomy-heartbeat.mjs";
import { reduceHeartbeatLedger } from "./heartbeat-ledger.mjs";
import { runCreditFreeImprovementLoop } from "./credit-free-skill-compound.mjs";
import { applyLocalReasonerGenerate, createLocalReasonerGenerate, thenable } from "./local-reasoner-generate.mjs";
import { putTransientResult } from "./local-reasoner-channel.mjs";
import { admitUnattendedFoundry } from "./unattended-foundry-admit.mjs";
import { runGrowthCompoundingLoop } from "./growth-compounding-loop.mjs";

export const UNATTENDED_CYCLE_KIND = "unattended-credit-free-cycle";
export const UNATTENDED_CYCLE_SCHEMA_VERSION = 1;
const PRIORITY = Object.freeze({ p0: "critical", p1: "high", p2: "medium", p3: "low" });

export function runUnattendedCreditFreeCycle({
  priorReceipts = [],
  generate = undefined,
  probe = null,
  invoke = null,
  cloudTagged = false,
  foundryRegistry = null,
  parentAgentId = foundryRegistry?.parentAgentId ?? "mahoraga",
  existingAgents = foundryRegistry?.agents ?? [],
  memoryRecords = [],
  existingObjectives = [],
  existingUnits = [],
  feats = [],
  ...heartbeatOptions
} = {}) {
  const heartbeat = runCreditFreeHeartbeat(heartbeatOptions);
  const inferredProbe = probe ?? { verified: heartbeatOptions.localReasonerReady === true };
  const generator = generate === undefined
    ? createLocalReasonerGenerate({ probe: inferredProbe, invoke, cloudTagged })
    : generate;
  const generation = heartbeat.intentKind === "autonomous-action"
    ? applyLocalReasonerGenerate(generator, {
      worldDigest: heartbeat.worldDigest,
      now: heartbeatOptions.now,
      channel: heartbeat.resultChannel ?? null,
      admission: heartbeat.localReasonerExecution ?? null,
    })
    : null;

  return thenable(generation, (resolved) => assembleCycle({
    heartbeat,
    generation: persistGeneration(heartbeat, resolved, heartbeatOptions.now),
    priorReceipts,
    parentAgentId,
    existingAgents,
    foundryRegistry,
    memoryRecords,
    existingObjectives,
    existingUnits,
    feats,
  }));
}

export function asHeartbeatCliReceipt(cycle) {
  if (!cycle || cycle.kind !== UNATTENDED_CYCLE_KIND) fail("unattended-cycle-invalid");
  return Object.freeze({
    ...cycle.heartbeat,
    unattended: Object.freeze({
      kind: cycle.kind,
      schemaVersion: cycle.schemaVersion,
      fastLoop: cycle.fastLoop,
      slowLoop: cycle.slowLoop,
      generation: cycle.generation,
      improvement: cycle.improvement,
      fleet: cycle.fleet,
      ledger: cycle.ledger,
      growth: summarizeGrowth(cycle.growth),
      creditCost: 0,
      paidFallback: false,
    }),
  });
}

function assembleCycle({
  heartbeat,
  generation,
  priorReceipts,
  parentAgentId,
  existingAgents,
  foundryRegistry,
  memoryRecords,
  existingObjectives,
  existingUnits,
  feats,
}) {
  if (heartbeat.creditCost !== 0 || heartbeat.paidFallback !== false) fail("unattended-paid-contamination");
  if (generation && (generation.creditCost !== 0 || generation.paidFallback !== false)) fail("unattended-paid-contamination");

  const resolvedParent = foundryRegistry?.parentAgentId ?? parentAgentId ?? "mahoraga";
  const resolvedAgents = foundryRegistry?.agents ?? existingAgents ?? [];
  const ledger = reduceHeartbeatLedger([...(Array.isArray(priorReceipts) ? priorReceipts : []), heartbeat]);
  const improvement = runCreditFreeImprovementLoop({
    learning: ledger.learning,
    learnedAt: heartbeat.observedAt,
    parentAgentId: resolvedParent,
    existingAgents: resolvedAgents,
  });
  const growth = runGrowthCompoundingLoop({
    entityId: "mahoraga",
    parentAgentId: resolvedParent,
    agents: resolvedAgents,
    feats,
    gaps: growthGapsFromLearning(ledger.learning),
    memoryRecords,
    existingObjectives,
    existingUnits,
    now: heartbeat.observedAt,
  });
  const admission = admitUnattendedFoundry({
    registry: foundryRegistry,
    parentAgentId: resolvedParent,
    plans: improvement.skills.foundryPlans,
  });
  if (admission.fleet.creditCost !== 0 || admission.fleet.paidFallback !== false) fail("unattended-paid-contamination");
  if (growth.creditCost !== 0 || growth.paidFallback !== false) fail("unattended-paid-contamination");

  return Object.freeze({
    schemaVersion: UNATTENDED_CYCLE_SCHEMA_VERSION,
    kind: UNATTENDED_CYCLE_KIND,
    observedAt: heartbeat.observedAt,
    fastLoop: "heartbeat",
    slowLoop: "skill-compound-and-foundry",
    nextAction: heartbeat.nextAction,
    heartbeat,
    generation,
    improvement: summarizeImprovement(improvement),
    growth,
    fleet: admission.fleet,
    registry: admission.registry,
    ledger: summarizeLedger(ledger),
    creditCost: 0,
    paidFallback: false,
  });
}

function growthGapsFromLearning(learning) {
  if (!learning || !Array.isArray(learning.gaps)) return [];
  return learning.gaps.map((gap) => {
    const priority = PRIORITY[gap?.priority] ?? "medium";
    const id = typeof gap?.id === "string" ? gap.id : "unknown-gap";
    return {
      id,
      state: gap?.state === "refused" ? "refused" : "open",
      priority,
      summary: typeof gap?.summary === "string" && gap.summary ? gap.summary : `Resolve ${id}.`,
      dependency: typeof gap?.dependency === "string" && gap.dependency ? gap.dependency : "local-runtime",
      workloadClass: inferWorkloadClass(id),
    };
  });
}

function inferWorkloadClass(id) {
  if (id.includes("research")) return "research";
  if (id.includes("artifact")) return "analysis";
  if (id.includes("repository") || id.includes("verify")) return "engineering";
  if (id.includes("destiny")) return "coordination";
  return "operations";
}

function persistGeneration(heartbeat, generation, now) {
  if (!generation) return null;
  const channel = heartbeat.resultChannel ?? null;
  if (!channel) return generation;
  try {
    putTransientResult(channel, {
      status: generation.status,
      resultSha256: generation.resultSha256,
    }, { now });
  } catch {
    return generation;
  }
  return generation;
}

function summarizeImprovement(improvement) {
  return Object.freeze({
    kind: improvement.kind,
    fastLoop: improvement.fastLoop,
    slowLoop: improvement.slowLoop,
    zeroCredit: true,
    dispatchCount: improvement.skills.dispatchCount,
    holdCount: improvement.skills.holdCount,
    refuseCount: improvement.skills.refuseCount,
    foundryPlanCount: improvement.skills.foundryPlans.length,
    methodIds: Object.freeze([...improvement.skills.methodIds]),
    creditCost: 0,
    paidFallback: false,
  });
}

function summarizeGrowth(growth) {
  if (!growth) return null;
  return Object.freeze({
    kind: growth.kind,
    fingerprint: growth.fingerprint,
    activeMemoryCount: growth.growthMetrics.activeMemoryCount,
    objectiveCount: growth.growthMetrics.objectiveCount,
    plannedUnitCount: growth.growthMetrics.plannedUnitCount,
    reusableFeatCount: growth.growthMetrics.reusableFeatCount,
    promotedCapabilities: Object.freeze([...growth.promotedCapabilities]),
    zeroCredit: true,
    creditCost: 0,
    paidFallback: false,
  });
}

function summarizeLedger(ledger) {
  return Object.freeze({
    heartbeatCount: ledger.heartbeatCount,
    lastHealthyAt: ledger.lastHealthyAt,
    lastObservedAt: ledger.lastObservedAt,
    nextActions: ledger.learning.nextActions,
    foundryPlanCount: ledger.skills.foundryPlans.length,
    creditCost: 0,
    paidFallback: false,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
