import type { RuntimeCapability } from "./runtime-relay";

export type CapabilityFamily = {
  id: "generative" | "agentic" | "execution" | "predictive";
  label: string;
  state: "routable" | "core-only" | "unavailable" | "unobserved";
  route: string | null;
  reason: string | null;
  evidence: string | null;
};

const FAMILIES = [
  { id: "generative", label: "Generative", routes: ["assistant.respond"] },
  { id: "agentic", label: "Agentic", routes: ["cognitive.cycle"] },
  { id: "execution", label: "Execution", routes: [
    "repository.inspect", "repository.write", "repository.verify",
    "cloud.inspect", "cloud.execute", "integration.inspect", "integration.execute",
    "browser.inspect", "browser.execute", "desktop.inspect", "desktop.execute",
    "codex.inspect", "codex.execute", "memory.read", "memory.write",
    "artifact.inspect", "artifact.write", "image.generate", "workspace-agent.trigger", "self.evolve",
  ] },
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

export const PREDICTION_STARTER = "/predict {\"observedState\":{\"queueDepth\":4},\"stateUncertainty\":0.2,\"action\":{\"actionId\":\"add-capacity\",\"effects\":{\"queueDepth\":-2},\"uncertainty\":0.1}}";
export const CYCLE_STARTER = "/cycle {\"members\":[{\"individualId\":\"builder\",\"parentAgentId\":\"mahoraga-core\",\"displayName\":\"Builder\",\"archetype\":\"builder-mind\",\"perspective\":\"implementation\",\"communicationStyle\":\"evidence-first\",\"traits\":{\"curiosity\":0.7},\"epistemicPosture\":{\"evidenceThreshold\":0.8,\"uncertaintyTolerance\":0.4,\"dissentDisposition\":\"surface-material-dissent\"},\"perspectiveTags\":[\"engineering\"],\"privateEpisodicRefs\":[]}],\"requiredPerspectiveTags\":[\"engineering\"],\"positions\":[{\"individualId\":\"builder\",\"conclusion\":\"hold\",\"confidence\":0.8,\"evidenceRefs\":[\"owner:scenario\"],\"assumptions\":[],\"unknowns\":[],\"dissentTags\":[]}],\"metacognition\":{\"evidenceCoverage\":0.9,\"calibratedConfidence\":0.8,\"knownUnknowns\":[],\"materialConflictCount\":0,\"reversible\":true},\"observedState\":{\"queueDepth\":4},\"stateUncertainty\":0.2,\"proposedAction\":{\"actionId\":\"add-capacity\",\"effects\":{\"queueDepth\":-2},\"uncertainty\":0.1},\"plannerSnapshot\":{\"workers\":[],\"activeLeases\":[],\"taskCounts\":{},\"objectives\":[],\"repository\":{\"verified\":true},\"providers\":[]}}";

export function projectCapabilityExplorer(coreReady: boolean, capabilities: readonly RuntimeCapability[]) {
  return capabilities.map((route) => {
    const available = coreReady && route.enabled !== false && route.routable === true;
    const paid = route.costClass === "licensed-cloud" || route.costClass === "metered-cloud";
    const state = !coreReady ? "unobserved" : !available ? "unavailable" : paid ? "core-only" : "routable";
    const starter = available && route.costClass === "deterministic"
      ? route.capability === "cognitive.predict" ? PREDICTION_STARTER : route.capability === "cognitive.cycle" ? CYCLE_STARTER : null
      : null;
    return {
      capability: route.capability, state, starter,
      reason: !coreReady ? "runtime-not-paired" : !available ? route.providerReasonCode ?? route.routingReason ?? (route.enabled === false ? "route-disabled" : "route-unavailable") : paid ? "non-zero-credit-route" : null,
      workers: coreReady ? route.workerIds : [],
      costClass: coreReady ? route.costClass ?? "unknown" : "unobserved",
      evidence: coreReady ? route.evidenceLevel ?? "unknown" : "unobserved",
      lastVerifiedAt: coreReady ? route.lastVerifiedAt ?? null : null,
    };
  });
}

const COGNITIVE_ABILITIES = [
  { capability: "cognitive.predict", label: "Prediction", description: "Simulate a proposed change and inspect uncertainty." },
  { capability: "cognitive.cycle", label: "Planning and decisions", description: "Deliberate, assess, predict, and plan with a cognitive receipt. Proposed actions are not executed." },
  { capability: "cognitive.assess", label: "Metacognitive assessment", description: "Assess evidence coverage, uncertainty, and known unknowns." },
  { capability: "cognitive.deliberate", label: "Collective deliberation", description: "Compare participant positions and preserve dissent. Advantage requires independent comparative evidence." },
  { capability: "cognitive.transfer", label: "Cross-domain transfer", description: "Evaluate transfer using domain-tagged held-out trials." },
  { capability: "cognitive.learn", label: "Institutional learning", description: "Promote lessons only through verified learning receipts and the runtime's authority checks." },
] as const;

/** Display supported cognitive routes; no intelligence tier or execution authority is inferred. */
export function projectCognitiveAbilities(coreReady: boolean, capabilities: readonly RuntimeCapability[], phase?: "loading" | "ready" | "error") {
  const observed = projectCapabilityExplorer(coreReady && phase === "ready", capabilities);
  return COGNITIVE_ABILITIES.map((ability) => {
    const row = observed.find((entry) => entry.capability === ability.capability && entry.state === "routable")
      ?? observed.find((entry) => entry.capability === ability.capability);
    if (!coreReady || phase !== "ready") return {
      ...ability, state: coreReady && phase === "error" ? "unavailable" : "unobserved",
      reason: coreReady && phase === "error" ? "runtime-observation-failed" : "runtime-not-observed",
      starter: null, evidence: "unobserved",
    };
    return { ...ability, state: row?.state ?? "unavailable", reason: row?.reason ?? (row ? null : "route-not-reported"),
      starter: row?.starter ?? null, evidence: row?.evidence ?? "unobserved" };
  });
}
