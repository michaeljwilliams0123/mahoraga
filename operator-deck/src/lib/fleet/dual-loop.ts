import { CREDIT_FREE_PROTOCOL_STEPS, type CreditFreeNextAction } from "./credit-free";
import { previewCreditFreeHeartbeat, type HeartbeatPreview } from "./heartbeat";

export const UNATTENDED_CYCLE_KIND = "unattended-credit-free-cycle" as const;

export type GenerationSidecar = {
  status: "ok" | "hold" | "refused";
  reason: string;
  creditCost: 0;
  paidFallback: false;
};

export type FoundryFleetPreview = {
  kind: "unattended-foundry-fleet";
  parentAgentId: string;
  agentCount: number;
  admittedCount: number;
  admittedAgentIds: readonly string[];
  creditCost: 0;
  paidFallback: false;
};

export type CycleMemoryPreview = {
  kind: "unattended-cycle-memory";
  receiptCount: number;
  agentCount: number;
  persisted: boolean;
  creditCost: 0;
  paidFallback: false;
};

export type UnattendedCyclePreview = {
  kind: typeof UNATTENDED_CYCLE_KIND;
  fastLoop: "heartbeat";
  slowLoop: "skill-compound-and-foundry";
  nextAction: CreditFreeNextAction;
  heartbeat: HeartbeatPreview;
  generation: GenerationSidecar | null;
  foundryPlanCount: number;
  fleet: FoundryFleetPreview;
  memory: CycleMemoryPreview;
  creditCost: 0;
  paidFallback: false;
};

export function previewUnattendedCycle(input: {
  healthOk: boolean;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  planeOk: boolean;
  planeReason?: string | null;
  hostedComputeOk?: boolean;
  inspectOnly?: boolean;
  localReasonerReady?: boolean;
  invokePresent?: boolean;
  cloudTagged?: boolean;
  loopbackReachable?: boolean;
}): UnattendedCyclePreview {
  const heartbeat = previewCreditFreeHeartbeat(input);
  const inspectOnly = input.inspectOnly !== false;
  let generation: GenerationSidecar | null = null;
  if (inspectOnly !== true) {
    if (input.cloudTagged === true) {
      generation = sidecar("refused", "ollama-cloud-not-credit-free");
    } else if (input.localReasonerReady !== true) {
      generation = sidecar("hold", "local-reasoner-not-ready");
    } else if (input.invokePresent !== true) {
      generation = sidecar("hold", "generation-invoke-required");
    } else if (input.loopbackReachable === false) {
      generation = sidecar("hold", "loopback-generate-unavailable");
    } else if (heartbeat.nextAction !== "dispatch-credit-free") {
      generation = sidecar(heartbeat.nextAction === "refuse-paid-route" ? "refused" : "hold", heartbeat.nextAction);
    } else {
      generation = sidecar("ok", "loopback-generate-verified");
    }
  }
  const foundryPlanCount = 1;
  const admittedAgentIds = ["mahoraga-heartbeat-destiny-trigger-not-ready-specialist"] as const;
  return {
    kind: UNATTENDED_CYCLE_KIND,
    fastLoop: "heartbeat",
    slowLoop: "skill-compound-and-foundry",
    nextAction: heartbeat.nextAction,
    heartbeat,
    generation,
    foundryPlanCount,
    fleet: {
      kind: "unattended-foundry-fleet",
      parentAgentId: "mahoraga",
      agentCount: 1,
      admittedCount: 1,
      admittedAgentIds,
      creditCost: 0,
      paidFallback: false,
    },
    memory: {
      kind: "unattended-cycle-memory",
      receiptCount: 1,
      agentCount: 1,
      persisted: true,
      creditCost: 0,
      paidFallback: false,
    },
    creditCost: 0,
    paidFallback: false,
  };
}

export function dualLoopMethodIds(): typeof CREDIT_FREE_PROTOCOL_STEPS {
  return CREDIT_FREE_PROTOCOL_STEPS;
}

function sidecar(status: GenerationSidecar["status"], reason: string): GenerationSidecar {
  return { status, reason, creditCost: 0, paidFallback: false };
}
