import { planChildAgents } from "./agent-foundry.mjs";
import { CREDIT_FREE_PROTOCOL_STEPS } from "./credit-free-autonomy.mjs";
import { compileRoutineDemonstration } from "./routine-library.mjs";

const PRIORITY = Object.freeze({ p0: "critical", p1: "high", p2: "medium", p3: "low" });

export function compoundCreditFreeSkills({
  learning,
  learnedAt = new Date().toISOString(),
  parentAgentId = "mahoraga",
  existingAgents = [],
} = {}) {
  if (!learning || typeof learning !== "object" || Array.isArray(learning)) fail("skill-learning-invalid");
  if (learning.kind !== "credit-free-learning" || learning.zeroCredit !== true) fail("skill-learning-invalid");
  if (learning.creditCost !== 0 || learning.paidFallback !== false) fail("skill-paid-contamination");

  const nextActions = learning.nextActions && typeof learning.nextActions === "object" ? learning.nextActions : {};
  const dispatches = count(nextActions["dispatch-credit-free"]);
  const holds = count(nextActions["hold-planned"]) + count(nextActions["wait-for-local-reasoner"]);
  const refusals = count(nextActions["refuse-paid-route"]);
  const total = Number.isInteger(learning.heartbeatCount) ? learning.heartbeatCount : 0;
  const confidence = total < 1 ? 0.5 : clamp(dispatches / total);

  const routine = compileRoutineDemonstration({
    agentId: "mahoraga-heartbeat",
    capability: "credit-free-protocol",
    intent: "Run observe-decide-act-verify-repair-report at zero credit without paid fallback.",
    parameters: [],
    surfaces: ["github", "loopback"],
    steps: CREDIT_FREE_PROTOCOL_STEPS.map((id) => ({
      action: id,
      evidence: Object.freeze([`protocol-${id}`, "credit-cost-zero"]),
      sideEffect: id === "act" || id === "repair" ? "mutation" : "none",
    })),
    successEvidence: ["credit-cost-zero", "paid-fallback-false", "protocol-report"],
  }, {
    learnedAt,
    successes: dispatches,
    failures: holds + refusals,
    confidence,
  });

  const foundryGaps = (Array.isArray(learning.gaps) ? learning.gaps : []).map(toFoundryGap).filter(Boolean);
  const foundryPlans = planChildAgents({
    parentAgentId,
    existingAgents,
    gaps: foundryGaps,
    createdAt: learnedAt,
  });

  return Object.freeze({
    schemaVersion: 1,
    kind: "credit-free-skill-compound",
    zeroCredit: true,
    creditCost: 0,
    paidFallback: false,
    methodIds: CREDIT_FREE_PROTOCOL_STEPS,
    dispatchCount: dispatches,
    holdCount: holds,
    refuseCount: refusals,
    routine,
    foundryPlans,
  });
}

export function runCreditFreeImprovementLoop({
  learning,
  learnedAt = new Date().toISOString(),
  parentAgentId = "mahoraga",
  existingAgents = [],
} = {}) {
  const skills = compoundCreditFreeSkills({ learning, learnedAt, parentAgentId, existingAgents });
  return Object.freeze({
    schemaVersion: 1,
    kind: "credit-free-improvement-loop",
    fastLoop: "heartbeat",
    slowLoop: "skill-compound-and-foundry",
    zeroCredit: true,
    creditCost: 0,
    paidFallback: false,
    learning,
    skills,
  });
}

function toFoundryGap(gap) {
  if (!gap || typeof gap !== "object" || Array.isArray(gap)) return null;
  const priority = PRIORITY[gap.priority];
  if (!priority) return null;
  if (typeof gap.id !== "string" || typeof gap.summary !== "string" || typeof gap.dependency !== "string") return null;
  return {
    id: gap.id,
    state: gap.state === "refused" ? "unverified" : "open",
    priority,
    summary: gap.summary,
    dependency: gap.dependency,
  };
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function clamp(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.99, Math.max(0.05, value));
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
