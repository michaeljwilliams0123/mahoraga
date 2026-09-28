import { createHash } from "node:crypto";

export type EvaluationCapability =
  | "self.inspect" | "self.question" | "self.model" | "self.challenge"
  | "self.experiment" | "self.compare" | "self.diagnose" | "self.revise"
  | "self.synthesize" | "self.verify" | "self.quarantine" | "self.rollback"
  | "self.transfer" | "self.explain" | "self.abstain" | "self.propose-capability"
  | "research.plan" | "research.inspect" | "research.synthesize"
  | "experiment.execute" | "memory.candidate" | "memory.absorb";

export type EvidenceReference = string;
export type CapabilityInvocation = Readonly<{
  capability: EvaluationCapability;
  inputFingerprint: string;
  authorityDecision: "routable" | "hold";
  evidenceRefs: readonly EvidenceReference[];
  resultFingerprint: string;
  reasonCode: string;
}>;
type Question = Readonly<{ id: string; text: string; target: string }>;
type Hypothesis = Readonly<{ id: string; statement: string; confidence: number; selfFault: boolean }>;
type PredictedEvidence = Readonly<{ hypothesisId: string; supports: readonly string[]; weakens: readonly string[] }>;
type Observation = Readonly<{ evidenceRef: string; supports: readonly string[]; weakens: readonly string[] }>;
type Counterevidence = Readonly<{ evidenceRef: string; hypothesisId: string }>;
type ConfidenceUpdate = Readonly<{ hypothesisId: string; before: number; after: number; evidenceRefs: readonly string[]; reasonCode: string }>;
type ModelDelta = Readonly<{ priorFingerprint: string; revisedFingerprint: string }>;

export type InvestigationInput = Readonly<{
  runId: string;
  sourceSha: string;
  trigger: string;
  behaviorImplicated: boolean;
  budgets: Readonly<{ questions: number; evidence: number; capabilityInvocations: number }>;
}>;
export type InvestigationStep =
  | ({ kind: "question" } & Question)
  | ({ kind: "hypothesis" } & Hypothesis)
  | ({ kind: "predicted-evidence" } & PredictedEvidence)
  | ({ kind: "observation" } & Observation)
  | ({ kind: "counterevidence" } & Counterevidence)
  | ({ kind: "confidence-update" } & ConfidenceUpdate)
  | ({ kind: "model-delta" } & ModelDelta)
  | ({ kind: "capability-invocation" } & CapabilityInvocation);
export type InvestigationCompletion = Readonly<{
  selectedConclusion: string | null;
  rejectedAlternatives: readonly string[];
  unknowns: readonly string[];
  stopReason: "evidence-sufficient" | "budget-exhausted" | "authority-unavailable" | "uncertainty-unresolved";
  nextCapabilityProposal?: Readonly<{ capability: string; permissionClass: "read" | "write" | "execute"; evidenceNeeded: readonly string[] }>;
}>;
export type InvestigationState = Readonly<{
  schemaVersion: 1;
  kind: "cognitive-investigation-state";
  runId: string;
  sourceSha: string;
  trigger: string;
  behaviorImplicated: boolean;
  budgets: Readonly<{ questions: number; evidence: number; capabilityInvocations: number }>;
  budgetUsed: Readonly<{ questions: number; evidence: number; capabilityInvocations: number }>;
  questions: readonly Question[];
  hypotheses: readonly Hypothesis[];
  predictedEvidence: readonly PredictedEvidence[];
  observations: readonly Observation[];
  counterevidence: readonly Counterevidence[];
  confidenceUpdates: readonly ConfidenceUpdate[];
  modelDelta: ModelDelta | null;
  requestedExperiments: readonly CapabilityInvocation[];
  predecessorFingerprint: string;
}>;
export type CognitiveInvestigationReceipt = Readonly<{
  schemaVersion: 1;
  kind: "cognitive-investigation-receipt";
  runId: string;
  sourceSha: string;
  trigger: string;
  questions: readonly Question[];
  hypotheses: readonly Hypothesis[];
  predictedEvidence: readonly PredictedEvidence[];
  requestedExperiments: readonly CapabilityInvocation[];
  observations: readonly Observation[];
  counterevidence: readonly Counterevidence[];
  confidenceUpdates: readonly ConfidenceUpdate[];
  modelDelta: ModelDelta | null;
  selectedConclusion: string | null;
  rejectedAlternatives: readonly string[];
  unknowns: readonly string[];
  stopReason: InvestigationCompletion["stopReason"];
  decision: "accept" | "hold";
  nextCapabilityProposal: Readonly<{ capability: string; permissionClass: "read" | "write" | "execute"; evidenceNeeded: readonly string[]; active: false }> | null;
  predecessorFingerprint: string;
  fingerprint: string;
}>;

const CAPABILITIES = new Set<EvaluationCapability>([
  "self.inspect", "self.question", "self.model", "self.challenge", "self.experiment", "self.compare",
  "self.diagnose", "self.revise", "self.synthesize", "self.verify", "self.quarantine", "self.rollback",
  "self.transfer", "self.explain", "self.abstain", "self.propose-capability", "research.plan", "research.inspect",
  "research.synthesize", "experiment.execute", "memory.candidate", "memory.absorb",
]);
const RECEIPT_KEYS = new Set([
  "schemaVersion", "kind", "runId", "sourceSha", "trigger", "questions", "hypotheses", "predictedEvidence",
  "requestedExperiments", "observations", "counterevidence", "confidenceUpdates", "modelDelta", "selectedConclusion",
  "rejectedAlternatives", "unknowns", "stopReason", "decision", "nextCapabilityProposal", "predecessorFingerprint", "fingerprint",
]);

export function createInvestigation(input: InvestigationInput): InvestigationState {
  exact(input, new Set(["runId", "sourceSha", "trigger", "behaviorImplicated", "budgets"]), "investigation-input-invalid");
  const budgets = budget(input.budgets);
  const state = {
    schemaVersion: 1 as const, kind: "cognitive-investigation-state" as const,
    runId: slug(input.runId, "investigation-run-id-invalid"), sourceSha: sha(input.sourceSha),
    trigger: text(input.trigger, 160, "investigation-trigger-invalid"), behaviorImplicated: input.behaviorImplicated === true,
    budgets, budgetUsed: { questions: 0, evidence: 0, capabilityInvocations: 0 },
    questions: [], hypotheses: [], predictedEvidence: [], observations: [], counterevidence: [], confidenceUpdates: [],
    modelDelta: null, requestedExperiments: [], predecessorFingerprint: "0".repeat(64),
  };
  return freeze({ ...state, predecessorFingerprint: digest(state) });
}

export function recordInvestigationStep(state: InvestigationState, step: InvestigationStep): InvestigationState {
  const current = validateState(state);
  if (!step || typeof step !== "object") fail("investigation-step-invalid");
  const next = cloneState(current);
  switch (step.kind) {
    case "question": {
      if (next.budgetUsed.questions >= next.budgets.questions) fail("investigation-question-budget-exhausted");
      const target = slug(step.target, "investigation-question-invalid");
      if (next.questions.some((question) => question.target === target)) fail("investigation-question-repeated");
      next.questions.push(freeze({ id: slug(step.id, "investigation-question-invalid"), text: text(step.text, 500, "investigation-question-invalid"), target }));
      next.budgetUsed.questions += 1;
      break;
    }
    case "hypothesis":
      if (next.hypotheses.length >= 6 || next.hypotheses.some((item) => item.id === step.id)) fail("investigation-hypothesis-invalid");
      next.hypotheses.push(freeze({ id: slug(step.id, "investigation-hypothesis-invalid"), statement: text(step.statement, 1_000, "investigation-hypothesis-invalid"), confidence: metric(step.confidence), selfFault: step.selfFault === true }));
      break;
    case "predicted-evidence":
      requireHypothesis(next, step.hypothesisId);
      if (step.supports.length === 0 || step.weakens.length === 0) fail("investigation-predicted-evidence-required");
      next.predictedEvidence.push(freeze({ hypothesisId: step.hypothesisId, supports: refs(step.supports), weakens: refs(step.weakens) }));
      break;
    case "observation":
      consumeEvidence(next);
      next.observations.push(freeze({ evidenceRef: reference(step.evidenceRef), supports: ids(step.supports), weakens: ids(step.weakens) }));
      break;
    case "counterevidence":
      requireHypothesis(next, step.hypothesisId); consumeEvidence(next);
      next.counterevidence.push(freeze({ evidenceRef: reference(step.evidenceRef), hypothesisId: step.hypothesisId }));
      break;
    case "confidence-update":
      requireHypothesis(next, step.hypothesisId);
      if (step.before !== (next.confidenceUpdates.filter((item) => item.hypothesisId === step.hypothesisId).at(-1)?.after ?? next.hypotheses.find((item) => item.id === step.hypothesisId)!.confidence)) fail("investigation-confidence-before-mismatch");
      if (!Array.isArray(step.evidenceRefs) || step.evidenceRefs.some((ref) => !next.observations.some((item) => item.evidenceRef === ref) && !next.counterevidence.some((item) => item.evidenceRef === ref))) fail("investigation-confidence-evidence-unobserved");
      next.confidenceUpdates.push(freeze({ hypothesisId: step.hypothesisId, before: metric(step.before), after: metric(step.after), evidenceRefs: refs(step.evidenceRefs), reasonCode: slug(step.reasonCode, "investigation-confidence-update-invalid") }));
      break;
    case "model-delta":
      if (next.modelDelta !== null) fail("investigation-model-delta-invalid");
      next.modelDelta = freeze({ priorFingerprint: sha256(step.priorFingerprint), revisedFingerprint: sha256(step.revisedFingerprint) });
      break;
    case "capability-invocation":
      if (!CAPABILITIES.has(step.capability) || next.budgetUsed.capabilityInvocations >= next.budgets.capabilityInvocations) fail("investigation-capability-invalid");
      next.requestedExperiments.push(freeze({ capability: step.capability, inputFingerprint: sha256(step.inputFingerprint), authorityDecision: step.authorityDecision, evidenceRefs: refs(step.evidenceRefs), resultFingerprint: sha256(step.resultFingerprint), reasonCode: slug(step.reasonCode, "investigation-capability-invalid") }));
      next.budgetUsed.capabilityInvocations += 1;
      break;
    default: fail("investigation-step-invalid");
  }
  const core = { ...next, predecessorFingerprint: current.predecessorFingerprint };
  return freeze({ ...core, predecessorFingerprint: digest(core) });
}

export function completeInvestigation(state: InvestigationState, input: InvestigationCompletion): CognitiveInvestigationReceipt {
  const current = validateState(state);
  if (input.stopReason === "evidence-sufficient") {
    if (current.questions.length === 0) fail("investigation-question-required");
    if (current.hypotheses.length < 2) fail("investigation-hypotheses-required");
    if (current.behaviorImplicated && !current.hypotheses.some((item) => item.selfFault)) fail("investigation-self-fault-hypothesis-required");
    if (current.hypotheses.some((item) => !current.predictedEvidence.some((prediction) => prediction.hypothesisId === item.id))) fail("investigation-predicted-evidence-required");
    if (current.counterevidence.length === 0) fail("investigation-counterevidence-required");
    if (current.observations.length === 0) fail("investigation-observation-required");
    if (current.confidenceUpdates.length === 0) fail("investigation-confidence-update-required");
    if (current.modelDelta === null) fail("investigation-model-delta-required");
    if (input.unknowns.length === 0) fail("investigation-unknowns-required");
    if (!input.selectedConclusion) fail("investigation-conclusion-required");
  }
  const proposal = input.nextCapabilityProposal === undefined ? null : freeze({
    capability: slug(input.nextCapabilityProposal.capability, "investigation-capability-proposal-invalid"),
    permissionClass: input.nextCapabilityProposal.permissionClass,
    evidenceNeeded: refs(input.nextCapabilityProposal.evidenceNeeded), active: false as const,
  });
  const core = {
    schemaVersion: 1 as const, kind: "cognitive-investigation-receipt" as const,
    runId: current.runId, sourceSha: current.sourceSha, trigger: current.trigger,
    questions: current.questions, hypotheses: current.hypotheses, predictedEvidence: current.predictedEvidence,
    requestedExperiments: current.requestedExperiments, observations: current.observations, counterevidence: current.counterevidence,
    confidenceUpdates: current.confidenceUpdates, modelDelta: current.modelDelta,
    selectedConclusion: input.selectedConclusion === null ? null : text(input.selectedConclusion, 2_000, "investigation-conclusion-invalid"),
    rejectedAlternatives: texts(input.rejectedAlternatives, 6, 1_000, "investigation-alternatives-invalid"),
    unknowns: texts(input.unknowns, 12, 1_000, "investigation-unknowns-invalid"), stopReason: input.stopReason,
    decision: input.stopReason === "evidence-sufficient" ? "accept" as const : "hold" as const,
    nextCapabilityProposal: proposal, predecessorFingerprint: current.predecessorFingerprint,
  };
  return freeze({ ...core, fingerprint: digest(core) });
}

export function validateInvestigationReceipt(value: unknown): CognitiveInvestigationReceipt {
  exact(value, RECEIPT_KEYS, "investigation-receipt-invalid");
  const record = value as unknown as CognitiveInvestigationReceipt;
  const { fingerprint, ...core } = record;
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || digest(core) !== fingerprint) fail("investigation-fingerprint-invalid");
  if (record.schemaVersion !== 1 || record.kind !== "cognitive-investigation-receipt") fail("investigation-receipt-invalid");
  sha(record.sourceSha); sha256(record.predecessorFingerprint); slug(record.runId, "investigation-receipt-invalid");
  if (![record.questions, record.hypotheses, record.predictedEvidence, record.observations, record.counterevidence, record.confidenceUpdates, record.requestedExperiments, record.rejectedAlternatives, record.unknowns].every(Array.isArray)) fail("investigation-receipt-invalid");
  if (record.questions.length > 8 || record.hypotheses.length > 6 || record.observations.length + record.counterevidence.length > 12 || record.requestedExperiments.length > 8) fail("investigation-receipt-invalid");
  const latestConfidence = new Map(record.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis.confidence]));
  const inspectedEvidence = new Set([...record.observations.map((item) => item.evidenceRef), ...record.counterevidence.map((item) => item.evidenceRef)]);
  for (const update of record.confidenceUpdates) {
    if (!update || latestConfidence.get(update.hypothesisId) !== update.before || !Array.isArray(update.evidenceRefs) || update.evidenceRefs.length === 0 || update.evidenceRefs.some((ref) => !inspectedEvidence.has(ref)) || !Number.isFinite(update.after) || update.after < 0 || update.after > 1) fail("investigation-receipt-invalid");
    latestConfidence.set(update.hypothesisId, update.after);
  }
  if (record.stopReason === "evidence-sufficient") {
    if (record.decision !== "accept" || !record.selectedConclusion || record.questions.length === 0 || record.hypotheses.length < 2 || record.observations.length === 0 || record.counterevidence.length === 0 || record.confidenceUpdates.length === 0 || record.modelDelta === null || record.unknowns.length === 0 || record.hypotheses.some((hypothesis) => !record.predictedEvidence.some((prediction) => prediction.hypothesisId === hypothesis.id))) fail("investigation-receipt-invalid");
  } else if (!["budget-exhausted", "authority-unavailable", "uncertainty-unresolved"].includes(record.stopReason) || record.decision !== "hold") fail("investigation-receipt-invalid");
  return freeze(record);
}

function validateState(value: InvestigationState): InvestigationState {
  if (!value || value.schemaVersion !== 1 || value.kind !== "cognitive-investigation-state") fail("investigation-state-invalid");
  sha256(value.predecessorFingerprint); return value;
}
function cloneState(value: InvestigationState) {
  return {
    ...value, budgets: { ...value.budgets }, budgetUsed: { ...value.budgetUsed }, questions: [...value.questions], hypotheses: [...value.hypotheses],
    predictedEvidence: [...value.predictedEvidence], observations: [...value.observations], counterevidence: [...value.counterevidence],
    confidenceUpdates: [...value.confidenceUpdates], modelDelta: value.modelDelta, requestedExperiments: [...value.requestedExperiments],
  };
}
function consumeEvidence(state: ReturnType<typeof cloneState>): void { if (state.budgetUsed.evidence >= state.budgets.evidence) fail("investigation-evidence-budget-exhausted"); state.budgetUsed.evidence += 1; }
function requireHypothesis(state: ReturnType<typeof cloneState>, id: string): void { if (!state.hypotheses.some((item) => item.id === id)) fail("investigation-hypothesis-unknown"); }
function budget(value: InvestigationInput["budgets"]) { return freeze({ questions: integer(value.questions, 1, 8), evidence: integer(value.evidence, 1, 12), capabilityInvocations: integer(value.capabilityInvocations, 1, 8) }); }
function integer(value: number, minimum: number, maximum: number): number { if (!Number.isInteger(value) || value < minimum || value > maximum) fail("investigation-budget-invalid"); return value; }
function metric(value: number): number { if (!Number.isFinite(value) || value < 0 || value > 1) fail("investigation-metric-invalid"); return value; }
function sha(value: string): string { if (!/^[a-f0-9]{40}$/.test(value)) fail("investigation-source-sha-invalid"); return value; }
function sha256(value: string): string { if (!/^[a-f0-9]{64}$/.test(value)) fail("investigation-digest-invalid"); return value; }
function slug(value: string, code: string): string { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{1,95}$/.test(value)) fail(code); return value; }
function reference(value: string): string { if (!/^[a-z0-9][a-z0-9:._-]{1,159}$/.test(value)) fail("investigation-evidence-ref-invalid"); return value; }
function refs(values: readonly string[]): readonly string[] { if (!Array.isArray(values) || values.length === 0 || values.length > 12 || new Set(values).size !== values.length) fail("investigation-evidence-ref-invalid"); return freeze(values.map(reference)); }
function ids(values: readonly string[]): readonly string[] { if (!Array.isArray(values) || values.length > 6) fail("investigation-hypothesis-invalid"); return freeze(values.map((value) => slug(value, "investigation-hypothesis-invalid"))); }
function text(value: string, maximum: number, code: string): string { if (typeof value !== "string") fail(code); const normalized = value.replace(/\s+/g, " ").trim(); if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code); return normalized; }
function texts(values: readonly string[], maximumItems: number, maximumLength: number, code: string): readonly string[] { if (!Array.isArray(values) || values.length > maximumItems) fail(code); return freeze(values.map((value) => text(value, maximumLength, code))); }
function exact(value: unknown, keys: ReadonlySet<string>, code: string): void { if (!value || typeof value !== "object" || Array.isArray(value)) fail(code); const actual = Object.keys(value); if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code); }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function fail(code: string): never { const error = new TypeError(code); (error as TypeError & { code: string }).code = code; throw error; }
