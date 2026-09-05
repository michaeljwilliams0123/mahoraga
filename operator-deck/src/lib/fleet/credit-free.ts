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
