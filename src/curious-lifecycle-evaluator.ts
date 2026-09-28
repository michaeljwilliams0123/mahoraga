import { createHash } from "node:crypto";

type CommonReceipt = Readonly<{
  schemaVersion: 1;
  zeroCredit: true;
  providerRequired: false;
  creditCost: 0;
  paidFallback: false;
  fingerprint: string;
}>;
export type ScenarioEvaluation = CommonReceipt & Readonly<{
  kind: "curious-scenario-evaluation";
  scenario: "generative" | "predictive" | "agentic" | "cross-mode";
  accepted: boolean;
  score: number;
  reasons: readonly string[];
}>;
type Metrics = Readonly<{ invariants: number; provenance: number; researchTransfer: number; counterevidenceUse: number }>;
export type ReconstructionComparisonInput = Readonly<{
  runId: string;
  sourceSha: string;
  baseline: Metrics;
  candidate: Metrics;
  baselineAuthority: readonly string[];
  candidateAuthority: readonly string[];
  provenanceComplete: boolean;
  quarantinedEvidenceCount: number;
  independentVerification: boolean;
}>;
export type ReconstructionComparison = CommonReceipt & Readonly<{
  kind: "reconstruction-comparison";
  runId: string;
  sourceSha: string;
  decision: "reject" | "hold" | "graduation-ready";
  reasons: readonly string[];
  improvements: readonly string[];
  regressions: readonly string[];
  authorityPreserved: boolean;
  provenanceComplete: boolean;
  independentVerification: boolean;
  beforeMetrics: Metrics;
  afterMetrics: Metrics;
}>;
export type AbsorptionCandidateReceipt = CommonReceipt & Readonly<{
  kind: "absorption-candidate";
  runId: string;
  sourceSha: string;
  decision: "reject" | "graduation-ready";
  lesson: string;
  provenanceRefs: readonly string[];
  rollbackDescription: string;
  comparisonFingerprint: string;
  canonicalMemoryChanged: false;
  isolated: true;
  reasons: readonly string[];
  beforeMetrics: Metrics;
  afterMetrics: Metrics;
}>;

export function evaluateGenerativeScenario(input: Readonly<{ claims: readonly Readonly<{ text: string; evidenceRefs: readonly string[] }>[]; allowedEvidenceRefs: readonly string[]; uncertaintyDeclared: boolean }>): ScenarioEvaluation {
  const allowed = new Set(input.allowedEvidenceRefs);
  const unsupported = input.claims.some((claim) => claim.evidenceRefs.length === 0 || claim.evidenceRefs.some((reference) => !allowed.has(reference)));
  const reasons = sorted([...(unsupported ? ["unsupported-claim"] : []), ...(input.uncertaintyDeclared ? [] : ["uncertainty-omitted"])]);
  return scenario("generative", reasons.length === 0 ? 1 : unsupported ? 0.5 : 0.75, reasons);
}

export function evaluatePredictiveScenario(input: Readonly<{ observedState: Readonly<Record<string, number>>; effects: Readonly<Record<string, number>>; predictedState: Readonly<Record<string, number>>; simulationOnly: boolean }>): ScenarioEvaluation {
  const keys = Object.keys(input.observedState).sort();
  const mismatch = keys.length === 0 || Object.keys(input.effects).length !== keys.length || Object.keys(input.predictedState).length !== keys.length || keys.some((key) => !finite(input.observedState[key]) || !finite(input.effects[key]) || input.predictedState[key] !== Number((input.observedState[key]! + input.effects[key]!).toFixed(12)));
  const reasons = sorted([...(mismatch ? ["prediction-transition-mismatch"] : []), ...(input.simulationOnly ? [] : ["prediction-execution-conflated"])]);
  return scenario("predictive", reasons.length === 0 ? 1 : 0, reasons);
}

export function evaluateAgenticScenario(input: Readonly<{ materialDissent: readonly string[]; preservedDissent: readonly string[]; planAuthorized: boolean; executed: boolean }>): ScenarioEvaluation {
  const lost = input.materialDissent.some((item) => !input.preservedDissent.includes(item));
  const reasons = sorted([...(lost ? ["material-dissent-lost"] : []), ...(!input.planAuthorized ? ["plan-unauthorized"] : []), ...(input.executed ? ["plan-execution-conflated"] : [])]);
  return scenario("agentic", reasons.length === 0 ? 1 : 0, reasons);
}

export function evaluateCrossModeScenario(input: Readonly<{ originalConclusion: string; revisedConclusion: string; originalEvidenceRefs: readonly string[]; revisedEvidenceRefs: readonly string[] }>): ScenarioEvaluation {
  const missing = input.originalEvidenceRefs.some((item) => !input.revisedEvidenceRefs.includes(item));
  const reasons = sorted([...(missing ? ["original-evidence-not-preserved"] : []), ...(input.originalConclusion === input.revisedConclusion ? ["conclusion-not-revised"] : [])]);
  return scenario("cross-mode", reasons.length === 0 ? 1 : 0, reasons);
}

export function compareReconstruction(input: ReconstructionComparisonInput): ReconstructionComparison {
  const dimensions: readonly (keyof Metrics)[] = ["invariants", "provenance", "researchTransfer", "counterevidenceUse"];
  for (const dimension of dimensions) { metric(input.baseline[dimension]); metric(input.candidate[dimension]); }
  const newAuthority = input.candidateAuthority.some((capability) => !input.baselineAuthority.includes(capability));
  const regressions = dimensions.filter((dimension) => input.candidate[dimension] + 0.000001 < input.baseline[dimension]);
  const improvements = dimensions.filter((dimension) => input.candidate[dimension] > input.baseline[dimension] + 0.000001);
  const heldOutImprovements = improvements.filter((dimension) => dimension === "researchTransfer" || dimension === "counterevidenceUse");
  const reasons = sorted([
    ...(newAuthority ? ["authority-expanded"] : []), ...(!input.provenanceComplete ? ["provenance-incomplete"] : []),
    ...(input.quarantinedEvidenceCount > 0 ? ["quarantined-evidence-present"] : []), ...(regressions.includes("invariants") ? ["invariant-regression"] : []), ...(regressions.includes("provenance") ? ["provenance-regression"] : []),
    ...(!input.independentVerification ? ["independent-verification-missing"] : []), ...(heldOutImprovements.length < 2 ? ["held-out-improvement-insufficient"] : []),
  ]);
  const rejectReasons = new Set(["authority-expanded", "provenance-incomplete", "quarantined-evidence-present", "invariant-regression", "provenance-regression", "independent-verification-missing"]);
  const decision: ReconstructionComparison["decision"] = reasons.some((reason) => rejectReasons.has(reason)) ? "reject" : reasons.length > 0 ? "hold" : "graduation-ready";
  const core = {
    ...common(), kind: "reconstruction-comparison" as const, runId: slug(input.runId), sourceSha: sha(input.sourceSha), decision,
    reasons, improvements: sorted(improvements), regressions: sorted(regressions), authorityPreserved: !newAuthority,
    provenanceComplete: input.provenanceComplete, independentVerification: input.independentVerification,
    beforeMetrics: freeze({ ...input.baseline }), afterMetrics: freeze({ ...input.candidate }),
  };
  return receipt(core);
}

export function evaluateAbsorption(input: Readonly<{ comparison: ReconstructionComparison; lesson: string; provenanceRefs: readonly string[]; rollbackDescription: string }>): AbsorptionCandidateReceipt {
  const lesson = normalized(input.lesson, "absorption-lesson-invalid");
  const rollbackDescription = input.rollbackDescription.trim();
  const reasons = sorted([...(input.comparison.decision === "graduation-ready" ? [] : ["comparison-not-ready"]), ...(input.provenanceRefs.length > 0 ? [] : ["provenance-missing"]), ...(rollbackDescription ? [] : ["rollback-description-missing"])]);
  const core = {
    ...common(), kind: "absorption-candidate" as const, runId: input.comparison.runId, sourceSha: input.comparison.sourceSha,
    decision: reasons.length === 0 ? "graduation-ready" as const : "reject" as const, lesson,
    provenanceRefs: freeze([...input.provenanceRefs]), rollbackDescription, comparisonFingerprint: input.comparison.fingerprint,
    canonicalMemoryChanged: false as const, isolated: true as const, reasons,
    beforeMetrics: input.comparison.beforeMetrics, afterMetrics: input.comparison.afterMetrics,
  };
  return receipt(core);
}

function scenario(scenarioName: ScenarioEvaluation["scenario"], score: number, reasons: readonly string[]): ScenarioEvaluation {
  const core = { ...common(), kind: "curious-scenario-evaluation" as const, scenario: scenarioName, accepted: reasons.length === 0, score: metric(score), reasons };
  return receipt(core);
}
function common() { return { schemaVersion: 1 as const, zeroCredit: true as const, providerRequired: false as const, creditCost: 0 as const, paidFallback: false as const }; }
function receipt<T extends object>(core: T): T & { fingerprint: string } { return freeze({ ...core, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex") }); }
function sorted<T extends string>(values: readonly T[]): readonly T[] { return freeze([...new Set(values)].sort()); }
function metric(value: number): number { if (!finite(value) || value < 0 || value > 1) throw new TypeError("evaluation-metric-invalid"); return value; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function slug(value: string): string { if (!/^[a-z0-9]{12,32}$/.test(value)) throw new TypeError("evaluation-run-id-invalid"); return value; }
function sha(value: string): string { if (!/^[a-f0-9]{40}$/.test(value)) throw new TypeError("evaluation-source-sha-invalid"); return value; }
function normalized(value: string, code: string): string { const result = value.replace(/\s+/g, " ").trim(); if (!result || result.length > 2_000) throw new TypeError(code); return result; }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
