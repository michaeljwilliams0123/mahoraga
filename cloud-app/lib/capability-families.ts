import type { RuntimeCapability } from "./runtime-relay";

export type CapabilityFamily = {
  id: "generative" | "agentic" | "predictive";
  label: string;
  state: "routable" | "core-only" | "unavailable" | "unobserved";
  route: string | null;
  reason: string | null;
  evidence: string | null;
};

const FAMILIES = [
  { id: "generative", label: "Generative", routes: ["assistant.respond"] },
  { id: "agentic", label: "Agentic", routes: ["cognitive.cycle", "codex.execute", "workspace-agent.trigger", "self.evolve"] },
  { id: "predictive", label: "Predictive", routes: ["cognitive.predict"] },
] as const;

/** A projection of observed routes, never a grant of execution authority. */
export function projectCapabilityFamilies(coreReady: boolean, capabilities: readonly RuntimeCapability[]): CapabilityFamily[] {
  return FAMILIES.map(({ id, label, routes }) => {
    if (!coreReady) return { id, label, state: "unobserved", route: null, reason: "runtime-not-paired", evidence: null };
    const records = capabilities.filter((entry) => routes.some((route) => route === entry.capability));
    const available = records.find((entry) => entry.routable === true && entry.enabled !== false);
    const observed = available ?? records[0];
    const coreOnly = available && (available.costClass === "licensed-cloud" || available.costClass === "metered-cloud");
    return {
      id,
      label,
      state: coreOnly ? "core-only" : available ? "routable" : "unavailable",
      route: observed?.capability ?? null,
      reason: coreOnly ? "non-zero-credit-route" : available ? null : observed?.providerReasonCode ?? observed?.routingReason ?? (observed ? "route-disabled" : "route-not-reported"),
      evidence: available ? observed?.evidenceLevel ?? "paired-core-route" : null,
    };
  });
}

export function predictiveChatAvailable(coreReady: boolean, capabilities: readonly RuntimeCapability[]): boolean {
  return coreReady && capabilities.some((route) => route.capability === "cognitive.predict"
    && route.enabled !== false && route.routable === true && route.costClass === "deterministic");
}

export function canSubmitPredictiveChat(coreReady: boolean, capabilities: readonly RuntimeCapability[], text: string, fileCount: number): boolean {
  return fileCount === 0 && /^\/predict(?:\s|$)/i.test(text.trim()) && predictiveChatAvailable(coreReady, capabilities);
}

export function cognitiveCycleAvailable(coreReady: boolean, capabilities: readonly RuntimeCapability[]): boolean {
  return coreReady && capabilities.some((route) => route.capability === "cognitive.cycle"
    && route.enabled !== false && route.routable === true && route.costClass === "deterministic");
}

export function canSubmitDeterministicCognitiveChat(coreReady: boolean, capabilities: readonly RuntimeCapability[], text: string, fileCount: number): boolean {
  if (fileCount !== 0) return false;
  return canSubmitPredictiveChat(coreReady, capabilities, text, fileCount)
    || (/^\/cycle(?:\s|$)/i.test(text.trim()) && cognitiveCycleAvailable(coreReady, capabilities));
}
