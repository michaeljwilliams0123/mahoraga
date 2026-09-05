export const CREDIT_FREE_PROTOCOL_STEPS = [
  "observe",
  "decide",
  "act",
  "verify",
  "repair",
  "report",
] as const;

export type CreditFreeProtocolStep = (typeof CREDIT_FREE_PROTOCOL_STEPS)[number];

export type AutonomyProviderClass =
  | "credit-free"
  | "local-reasoner"
  | "subscription-local"
  | "metered"
  | "unknown";

export type CreditFreeNextAction =
  | "dispatch-credit-free"
  | "hold-planned"
  | "wait-for-local-reasoner"
  | "refuse-paid-route";

const CREDIT_FREE_PROVIDERS = new Set([
  "repository",
  "local-core",
  "self-healer",
  "steward-learning",
  "browser",
  "desktop",
]);

const LOCAL_REASONER_PROVIDERS = new Set(["local-reasoner", "lm-studio", "ollama"]);
const SUBSCRIPTION_LOCAL_PROVIDERS = new Set(["primary-codex-builder"]);
const METERED_PROVIDERS = new Set([
  "openai-platform",
  "github-copilot",
  "workspace-agent-cloud",
  "codex-cloud",
]);

export function classifyAutonomyProvider(provider: string): AutonomyProviderClass {
  const name = provider.trim().toLowerCase();
  if (CREDIT_FREE_PROVIDERS.has(name)) return "credit-free";
  if (LOCAL_REASONER_PROVIDERS.has(name)) return "local-reasoner";
  if (SUBSCRIPTION_LOCAL_PROVIDERS.has(name)) return "subscription-local";
  if (METERED_PROVIDERS.has(name)) return "metered";
  return "unknown";
}

export function creditFreeHealthLabel(status: "healthy" | "degraded" | "unhealthy"): "ok" | "warn" | "danger" {
  if (status === "healthy") return "ok";
  if (status === "degraded") return "warn";
  return "danger";
}

export function resolveCreditFreeNextAction(input: {
  healthOk: boolean;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  planeOk: boolean;
  planeReason?: string | null;
  hostedComputeOk?: boolean;
}): CreditFreeNextAction {
  if (input.hostedComputeOk === false) return "hold-planned";
  if (!input.healthOk) return input.healthStatus === "degraded" ? "hold-planned" : "refuse-paid-route";
  if (input.planeOk) return "dispatch-credit-free";
  if (input.planeReason === "local-reasoner-not-ready") return "wait-for-local-reasoner";
  return "refuse-paid-route";
}

export function admitLocalReasonerExecution(input: {
  verified?: boolean;
  channel?: {
    persistence: string;
    promptPersistenceAllowed: boolean;
    responsePersistenceAllowed: boolean;
    creditCost: number;
    paidFallback: boolean;
    expiresAt: string;
  } | null;
  now?: number;
}): { executionEnabled: boolean; reason: string } {
  if (input.verified !== true) return { executionEnabled: false, reason: "local-reasoner-not-ready" };
  const channel = input.channel;
  const now = input.now ?? Date.now();
  if (
    !channel
    || channel.persistence !== "memory-only"
    || channel.promptPersistenceAllowed !== false
    || channel.responsePersistenceAllowed !== false
    || channel.creditCost !== 0
    || channel.paidFallback !== false
    || Date.parse(channel.expiresAt) <= now
  ) {
    return { executionEnabled: false, reason: "transient-result-channel-required" };
  }
  return { executionEnabled: true, reason: "transient-result-channel-open" };
}

export function actuateCreditFreeCycle(input: {
  nextAction: CreditFreeNextAction;
  intentKind?: "inspect" | "repair" | "autonomous-action";
  executionEnabled?: boolean;
  worldDigest: string;
}): {
  status: "verified" | "held" | "refused";
  reason: string;
  resultSha256: string;
  creditCost: 0;
  paidFallback: false;
} {
  const digest = input.worldDigest;
  if (input.nextAction === "refuse-paid-route") {
    return { status: "refused", reason: "refuse-paid-route", resultSha256: digest, creditCost: 0, paidFallback: false };
  }
  if (input.nextAction !== "dispatch-credit-free") {
    return { status: "held", reason: input.nextAction, resultSha256: digest, creditCost: 0, paidFallback: false };
  }
  if (input.intentKind === "inspect" || input.intentKind === "repair") {
    return { status: "verified", reason: "inspect-reported", resultSha256: digest, creditCost: 0, paidFallback: false };
  }
  if (input.executionEnabled !== true) {
    return { status: "held", reason: "execution-not-admitted", resultSha256: digest, creditCost: 0, paidFallback: false };
  }
  return { status: "verified", reason: "generation-result-verified", resultSha256: digest, creditCost: 0, paidFallback: false };
}
