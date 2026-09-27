import type { RuntimeCapability } from "./runtime-relay";

export type CapabilityFamily = {
  id: "generative" | "agentic" | "predictive";
  label: string;
  state: "routable" | "unavailable" | "unobserved";
  route: string | null;
  reason: string | null;
  evidence: string | null;
};

const FAMILIES = [
  { id: "generative", label: "Generative", routes: ["assistant.respond"] },
  { id: "agentic", label: "Agentic", routes: ["codex.execute", "workspace-agent.trigger", "self.evolve"] },
  { id: "predictive", label: "Predictive", routes: ["cognitive.predict"] },
] as const;

/** A projection of observed routes, never a grant of execution authority. */
export function projectCapabilityFamilies(coreReady: boolean, capabilities: readonly RuntimeCapability[]): CapabilityFamily[] {
  return FAMILIES.map(({ id, label, routes }) => {
    if (!coreReady) return { id, label, state: "unobserved", route: null, reason: "runtime-not-paired", evidence: null };
    const records = capabilities.filter((entry) => routes.some((route) => route === entry.capability));
    const available = records.find((entry) => entry.routable === true && entry.enabled !== false);
    const observed = available ?? records[0];
    return {
      id,
      label,
      state: available ? "routable" : "unavailable",
      route: observed?.capability ?? null,
      reason: available ? null : observed?.providerReasonCode ?? observed?.routingReason ?? (observed ? "route-disabled" : "route-not-reported"),
      evidence: available ? observed?.evidenceLevel ?? "paired-core-route" : null,
    };
  });
}
