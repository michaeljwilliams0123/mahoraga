import { createHash, createPublicKey, verify } from "node:crypto";
import { MCCB_COHORTS } from "./mccb-report.ts";

/** Public challenge families only. Blinded inputs and ground truth stay outside this repository. */
export const COGNITION_CASES = ["minority-rescue", "uncertainty-hold", "cross-domain-transfer", "identity-continuity",
  "verified-social-learning", "causal-intervention", "long-horizon-replan", "capability-composition", "future-authority"] as const;
const STAGES = ["ownerRequest", "authorityDecision", "routing", "execution", "modelInvocation", "persistence", "idempotency", "postcondition"] as const;
type Stage = typeof STAGES[number];
type Cohort = typeof MCCB_COHORTS[number];
type CaseId = typeof COGNITION_CASES[number];
type Case = { caseId: CaseId; inputDigest: string; requiredEvidence: "execution" | "model-execution" };
type Observation = { runId: string; caseId: CaseId; repetition: number; cohort: Cohort; sourceSha: string;
  deploymentSourceSha: string; deploymentId: string; evaluatorDigest: string; inputDigest: string; challengeId: string;
  route: "cloudflare"; worker: string; provider: string; outcome: "completed" | "failed" | "held";
  uncertainty: string[]; dissent: string[]; objectiveCandidateDigest: string | null;
  institutionalLearningCandidateDigest: string | null; modelInvocations: number; evidence: Record<Stage, string | null> };
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MANIFEST_KEYS = ["schemaVersion", "kind", "campaignId", "sourceSha", "evaluatorVersion", "evaluatorDigest", "suiteDigest", "costEnvelopeDigest", "repetitions", "cases"];
const OBSERVATION_KEYS = ["schemaVersion", "kind", "campaignId", "manifestDigest", "runId", "caseId", "repetition", "cohort", "sourceSha",
  "deploymentSourceSha", "deploymentId", "evaluatorDigest", "inputDigest", "challengeId", "route", "worker", "provider", "outcome",
  "uncertainty", "dissent", "objectiveCandidateDigest", "institutionalLearningCandidateDigest", "modelInvocations", "evidence"];

/** Canonical, domain-separated bytes for an external evaluator to sign. This function never holds a private key. */
export function campaignSigningPayload(kind: "manifest" | "observation", payload: unknown): Buffer {
  if (kind !== "manifest" && kind !== "observation") fail();
  return Buffer.from(`mahoraga-cognition-campaign-v1\n${kind}\n${canonical(payload)}`, "utf8");
}

/** Verify attribution to an externally supplied key and account receipt gaps; never verify evaluator independence or score answers. */
export function buildCognitionCampaignLedger(value: unknown, options: { expectedSourceSha: string; evaluatorPublicKeySpki: string }) {
  const expectedSourceSha = text(options.expectedSourceSha, SHA);
  let key: ReturnType<typeof createPublicKey>;
  try {
    if (typeof options.evaluatorPublicKeySpki !== "string" || options.evaluatorPublicKeySpki.length > 4096
      || !options.evaluatorPublicKeySpki.startsWith("-----BEGIN PUBLIC KEY-----")) fail("cognition-campaign-key-invalid");
    key = createPublicKey(options.evaluatorPublicKeySpki);
    if (key.asymmetricKeyType !== "ed25519") fail("cognition-campaign-key-invalid");
  } catch { fail("cognition-campaign-key-invalid"); }
  const input = exact(value, ["manifest", "observations"]);
  const manifest = signedPayload(input.manifest, "manifest", key);
  exact(manifest, MANIFEST_KEYS);
  if (manifest.schemaVersion !== 1 || manifest.kind !== "cognition-campaign") fail();
  const sourceSha = text(manifest.sourceSha, SHA);
  if (sourceSha !== expectedSourceSha) fail("cognition-campaign-source-mismatch");
  const campaignId = token(manifest.campaignId), evaluatorVersion = token(manifest.evaluatorVersion);
  const evaluatorDigest = text(manifest.evaluatorDigest, DIGEST), suiteDigest = text(manifest.suiteDigest, DIGEST);
  const costEnvelopeDigest = text(manifest.costEnvelopeDigest, DIGEST), repetitions = integer(manifest.repetitions, 1, 20);
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== COGNITION_CASES.length) fail();
  const cases: Case[] = Array.from(manifest.cases, value => {
    const row = exact(value, ["caseId", "inputDigest", "requiredEvidence"]);
    if (!COGNITION_CASES.includes(row.caseId as CaseId) || !["execution", "model-execution"].includes(row.requiredEvidence as string)) fail();
    return { caseId: row.caseId as CaseId, inputDigest: text(row.inputDigest, DIGEST), requiredEvidence: row.requiredEvidence as Case["requiredEvidence"] };
  }).sort((a, b) => COGNITION_CASES.indexOf(a.caseId) - COGNITION_CASES.indexOf(b.caseId));
  const byCase = new Map(cases.map(row => [row.caseId, row]));
  if (byCase.size !== COGNITION_CASES.length || new Set(cases.map(row => row.inputDigest)).size !== cases.length) fail();
  const manifestDigest = hash(campaignSigningPayload("manifest", manifest));
  if (!Array.isArray(input.observations) || input.observations.length > 540) fail();
  const ids = new Set<string>(), cells = new Set<string>(), executions = new Set<string>(), invocations = new Set<string>(), challenges = new Set<string>();
  const observations: Observation[] = Array.from(input.observations, (envelope): Observation => {
    const row = signedPayload(envelope, "observation", key);
    exact(row, OBSERVATION_KEYS);
    if (row.schemaVersion !== 1 || row.kind !== "cognition-observation" || row.route !== "cloudflare") fail();
    const caseId = row.caseId as CaseId, declared = byCase.get(caseId);
    if (!declared || !MCCB_COHORTS.includes(row.cohort as Cohort)) fail("cognition-campaign-undeclared-cell");
    const repetition = integer(row.repetition, 1, repetitions), cohort = row.cohort as Cohort;
    if (row.campaignId !== campaignId || row.manifestDigest !== manifestDigest || row.sourceSha !== sourceSha
      || row.deploymentSourceSha !== sourceSha || row.evaluatorDigest !== evaluatorDigest || row.inputDigest !== declared.inputDigest) {
      fail("cognition-campaign-provenance-mismatch");
    }
    const rawEvidence = exact(row.evidence, STAGES);
    const evidence = Object.fromEntries(STAGES.map(stage => [stage, nullableDigest(rawEvidence[stage])])) as Observation["evidence"];
    // A routing reference cannot be relabeled as an execution receipt.
    if (evidence.execution !== null && evidence.execution === evidence.routing) fail();
    const modelInvocations = integer(row.modelInvocations, 0, 1_000_000);
    if ((modelInvocations > 0) !== (evidence.modelInvocation !== null) || (modelInvocations > 0 && evidence.execution === null)) fail();
    const runId = token(row.runId), challengeId = token(row.challengeId), cell = cellKey(caseId, repetition, cohort);
    if (ids.has(runId) || cells.has(cell) || challenges.has(challengeId) || (evidence.execution !== null && executions.has(evidence.execution))
      || (evidence.modelInvocation !== null && invocations.has(evidence.modelInvocation))) fail("cognition-campaign-duplicate");
    ids.add(runId); cells.add(cell); challenges.add(challengeId); if (evidence.execution !== null) executions.add(evidence.execution);
    if (evidence.modelInvocation !== null) invocations.add(evidence.modelInvocation);
    if (!["completed", "failed", "held"].includes(row.outcome as string)) fail();
    return { runId, caseId, repetition, cohort, sourceSha, deploymentSourceSha: sourceSha, deploymentId: token(row.deploymentId),
      evaluatorDigest, inputDigest: declared.inputDigest, challengeId, route: "cloudflare", worker: token(row.worker), provider: token(row.provider),
      outcome: row.outcome as Observation["outcome"], uncertainty: tokens(row.uncertainty), dissent: tokens(row.dissent),
      objectiveCandidateDigest: nullableDigest(row.objectiveCandidateDigest), institutionalLearningCandidateDigest: nullableDigest(row.institutionalLearningCandidateDigest),
      modelInvocations, evidence };
  }).sort((a, b) => COGNITION_CASES.indexOf(a.caseId) - COGNITION_CASES.indexOf(b.caseId)
    || a.repetition - b.repetition || MCCB_COHORTS.indexOf(a.cohort) - MCCB_COHORTS.indexOf(b.cohort));
  const byCell = new Map(observations.map(row => [cellKey(row.caseId, row.repetition, row.cohort), row]));
  const ledger = cases.flatMap(item => Array.from({ length: repetitions }, (_, index) => MCCB_COHORTS.map(cohort => {
    const repetition = index + 1, row = byCell.get(cellKey(item.caseId, repetition, cohort));
    const gaps: string[] = [];
    if (!row) gaps.push("observation-missing");
    else {
      for (const stage of STAGES) if (stage !== "modelInvocation" && row.evidence[stage] === null) gaps.push(`${stage}-missing`);
      if (item.requiredEvidence === "model-execution" && row.modelInvocations === 0) gaps.push("model-execution-missing");
    }
    const executionKind = !row ? "missing" : row.evidence.execution === null ? (row.evidence.routing === null ? "no-execution" : "routing-only")
      : row.modelInvocations > 0 ? "model-execution" : "deterministic-execution";
    return { caseId: item.caseId, repetition, cohort, runId: row?.runId ?? null,
      status: !row ? "missing" : gaps.length ? "evidence-gaps" : "execution-reported", executionKind, gaps };
  })).flat());
  const core = { schemaVersion: 1, kind: "cognition-campaign-ledger", campaignId, sourceSha, manifestDigest,
    evaluatorVersion, evaluatorDigest, suiteDigest, costEnvelopeDigest, repetitions, cases,
    evaluatorKeyFingerprint: hash(key.export({ type: "spki", format: "der" })),
    attribution: "signature-valid-for-operator-supplied-key", independentEvaluationVerified: false, liveExecutionVerified: false,
    cohortValidityVerified: false, superiorityEstablished: false, authorityGranted: false, cells: ledger, observations };
  return freeze({ ...core, fingerprint: hash(Buffer.from(canonical(core))) });
}

function signedPayload(value: unknown, kind: "manifest" | "observation", key: ReturnType<typeof createPublicKey>) {
  const envelope = exact(value, ["payload", "signature"]), payload = object(envelope.payload);
  const signature = text(envelope.signature, /^[A-Za-z0-9_-]{86}$/), bytes = Buffer.from(signature, "base64url");
  if (bytes.toString("base64url") !== signature || !verify(null, campaignSigningPayload(kind, payload), key, bytes)) fail("cognition-campaign-signature-invalid");
  return payload;
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonical).join(",")}]`;
  const record = object(value);
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]) {
  const record = object(value);
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) fail();
  return record;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || /\s/.test(value) || !pattern.test(value)) fail();
  return value;
}
function token(value: unknown) { return text(value, ID); }
function tokens(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 32) fail();
  const result = Array.from(value, token); if (new Set(result).size !== result.length) fail(); return result;
}
function nullableDigest(value: unknown) { return value === null ? null : text(value, DIGEST); }
function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(); return value;
}
function cellKey(caseId: string, repetition: number, cohort: string) { return `${caseId}/${repetition}/${cohort}`; }
function hash(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function fail(code = "cognition-campaign-input-invalid"): never { throw new TypeError(code); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  } return value;
}
