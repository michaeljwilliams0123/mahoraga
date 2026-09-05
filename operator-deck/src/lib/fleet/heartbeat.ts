import {
  classifyAutonomyProvider,
  CREDIT_FREE_PROTOCOL_STEPS,
  resolveCreditFreeNextAction,
  type CreditFreeNextAction,
} from "./credit-free";

export const HEARTBEAT_KIND = "credit-free-heartbeat" as const;

export type HeartbeatStep = {
  id: string;
  provider: string;
  capability: string;
  status: "admissible" | "blocked";
  creditCost: 0;
  paidFallback: false;
};

export type HeartbeatPreview = {
  kind: typeof HEARTBEAT_KIND;
  nextAction: CreditFreeNextAction;
  executable: boolean;
  protocol: typeof CREDIT_FREE_PROTOCOL_STEPS;
  steps: HeartbeatStep[];
  creditCost: 0;
  paidFallback: false;
};

const INSPECT_STEPS = [
  { id: "observe", provider: "repository", capability: "repository.status" },
  { id: "decide", provider: "local-core", capability: "system.health" },
  { id: "report", provider: "repository", capability: "repository.status" },
] as const;

const CONTAINMENT_STEPS = [
  { id: "observe", provider: "repository", capability: "repository.status" },
  { id: "decide", provider: "local-core", capability: "system.health" },
  { id: "act", provider: "self-healer", capability: "repair.scan" },
  { id: "verify", provider: "repository", capability: "repository.verify" },
  { id: "repair", provider: "self-healer", capability: "repair.apply" },
  { id: "report", provider: "repository", capability: "repository.verify" },
] as const;

export function previewCreditFreeHeartbeat(input: {
  healthOk: boolean;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  planeOk: boolean;
  planeReason?: string | null;
  hostedComputeOk?: boolean;
  inspectOnly?: boolean;
}): HeartbeatPreview {
  const nextAction = resolveCreditFreeNextAction(input);
  const graph = input.inspectOnly === false ? CONTAINMENT_STEPS : INSPECT_STEPS;
  const steps = graph.map((node) => {
    const className = classifyAutonomyProvider(node.provider);
    return {
      ...node,
      status: className === "credit-free" && nextAction === "dispatch-credit-free" ? "admissible" : nextAction === "dispatch-credit-free" ? "admissible" : "blocked",
      creditCost: 0 as const,
      paidFallback: false as const,
    };
  });
  return {
    kind: HEARTBEAT_KIND,
    nextAction,
    executable: nextAction === "dispatch-credit-free",
    protocol: CREDIT_FREE_PROTOCOL_STEPS,
    steps,
    creditCost: 0,
    paidFallback: false,
  };
}
