import { createHash } from "node:crypto";
import { discoverHuggingFace, inspectHuggingFaceRevision, scoreHuggingFaceBenchmark } from "./hugging-face-integration.ts";
import { generateLocalStructuredOutput, generateLocalEmbeddings } from "./local-ai-inference.ts";
import { createSemanticIndex } from "./semantic-memory.ts";
// @ts-expect-error Existing in-memory channel is a governed JavaScript module.
import { openTransientResultChannel } from "./local-reasoner-channel.mjs";

const SHA64 = /^[a-f0-9]{64}$/;
const REF = /^[a-z][a-z0-9-]*:[A-Za-z0-9._:-]{1,200}$/;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const error = (reason: string): never => { throw new Error(reason); };
const own = (value: unknown, keys: string[]): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
};
type TrialCase = { id: string; prompt: string; schema: unknown; expectedSha256: string };
export type TrialSuite = { suiteId: string; cases: TrialCase[] };
export type RecallInput = { documents: { reference: string; text: string }[]; query: string; limit: number };
export type NativeLearningReceipt = {
  schemaVersion: 1;
  kind: "hf-native-learning";
  observedAt: string;
  status: "candidate-research" | "local-trial" | "local-recall";
  fingerprint: string;
  source: "huggingface-public" | "admitted-local-ollama";
  result: unknown;
  creditCost: 0;
  paidFallback: false;
  productionActivated: false;
};

function receipt(status: NativeLearningReceipt["status"], source: NativeLearningReceipt["source"], result: unknown, now = new Date()): NativeLearningReceipt {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) error("hf-native-clock-invalid");
  return Object.freeze({ schemaVersion: 1, kind: "hf-native-learning", observedAt: now.toISOString(),
    status, source, result, fingerprint: hash({ status, source, result }), creditCost: 0, paidFallback: false, productionActivated: false });
}

/** Ranked for investigation only: downloads are not a model-quality score. */
export async function scoutNativeHuggingFace(query: string, options: {
  fetchImpl?: typeof fetch; limit?: number; now?: Date; inspectRevision?: boolean;
} = {}): Promise<NativeLearningReceipt> {
  const catalog = await discoverHuggingFace("models", query, { limit: options.limit ?? 6, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (catalog.kind !== "models") return error("hf-native-catalog-invalid");
  const candidates = [];
  for (const candidate of catalog.candidates) {
    if (!candidate.revision || candidate.private || candidate.gated || !candidate.license) continue;
    let revisionVerified = false;
    if (options.inspectRevision !== false) {
      try {
        const r = await inspectHuggingFaceRevision(candidate.repoId, candidate.revision, { ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
        revisionVerified = r.revisionVerified;
      } catch { /* quarantine candidates when Hub is unreachable */ }
    }
    candidates.push({
      repoId: candidate.repoId, revision: candidate.revision, license: candidate.license,
      downloads: candidate.downloads, revisionVerified,
      admissionState: "requires-independent-inspection" as const,
      modelExecutionVerified: false, productionActivated: false,
    });
  }
  candidates.sort((a, b) => Number(b.revisionVerified) - Number(a.revisionVerified)
    || b.downloads - a.downloads || a.repoId.localeCompare(b.repoId));
  return receipt("candidate-research", "huggingface-public",
    { query, count: candidates.length, candidates, admissionPerformed: false, hostedInferencePerformed: false },
    options.now);
}

function requireLocalDev(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== "development" || env.ALLOW_LOCAL_AI_DEV !== "true") error("hf-local-development-disabled");
}

function validateTrial(suite: TrialSuite) {
  if (!own(suite, ["suiteId", "cases"]) || typeof suite.suiteId !== "string"
    || !/^[a-z][a-z0-9-]{1,63}$/.test(suite.suiteId) || !Array.isArray(suite.cases)
    || suite.cases.length < 1 || suite.cases.length > 8) error("hf-native-suite-invalid");
  const ids = new Set<string>(); let bytes = 0;
  for (const entry of suite.cases) {
    if (!own(entry, ["id", "prompt", "schema", "expectedSha256"])
      || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(entry.id) || ids.has(entry.id)
      || typeof entry.prompt !== "string" || !entry.prompt.trim()
      || !SHA64.test(entry.expectedSha256)) error("hf-native-suite-invalid");
    ids.add(entry.id); bytes += Buffer.byteLength(entry.prompt, "utf8");
  }
  if (bytes > 32_768) error("hf-native-suite-too-large");
}

/** Real requests to existing admitted Ollama local inference, no response or prompt persisted. */
export async function trialNativeHuggingFace(suite: TrialSuite, options: {
  modelSupplyChain?: unknown; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number;
  env?: Record<string, string | undefined>;
} = {}): Promise<NativeLearningReceipt> {
  requireLocalDev(options.env ?? process.env);
  validateTrial(suite);
  const observations: { id: string; status: "completed" | "failed"; resultSha256: string | null; durationMs: number }[] = [];
  const digests = new Set<string>();
  const holds: { id: string; reason: string }[] = [];
  for (const item of suite.cases) {
    const channel = openTransientResultChannel({ ttlMs: 120_000, ...(options.now ? { now: options.now().getTime() } : {}) });
    const start = performance.now();
    try {
      const local = await generateLocalStructuredOutput({ prompt: item.prompt, schema: item.schema },
        { ...options, channel });
      digests.add(local.receipt.modelDigest);
      observations.push({ id: item.id, status: "completed", resultSha256: local.receipt.resultSha256, durationMs: Math.round(performance.now() - start) });
    } catch (error) {
      const cause = error instanceof Error && /^(?:model-supply-chain-|local-ai-|transient-|structured-output-)[a-z-]{1,72}$/.test(error.message)
        ? error.message : "hf-local-execution-unavailable";
      holds.push({ id: item.id, reason: cause });
      observations.push({ id: item.id, status: "failed", resultSha256: null, durationMs: Math.round(performance.now() - start) });
    }
  }
  const score = scoreHuggingFaceBenchmark({ suiteId: suite.suiteId,
    cases: suite.cases.map(({ id, expectedSha256 }) => ({ id, expectedSha256 })),
    observations });
  const modelDigest = digests.size === 1 ? [...digests][0]! : null;
  return receipt("local-trial", "admitted-local-ollama", {
    ...score, evidenceClass: "live-local-execution-with-gated-admission",
    modelExecutionVerified: modelDigest !== null && observations.every(o => o.status === "completed"),
    modelDigest, suiteFingerprint: hash(suite.cases.map(({ id, prompt, schema, expectedSha256 }) => ({
      id, promptSha256: hash(prompt), schemaSha256: hash(schema), expectedSha256 }))),
    promotionEligible: false, productionActivated: false,
    observations, holds, promptPersistence: false, responsePersistence: false,
  }, options.now ? options.now() : new Date());
}

/** Real admitted local embedding execution, but returns only reference/similarity metadata. */
export async function recallNativeHuggingFace(input: RecallInput, options: {
  modelSupplyChain?: unknown; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number;
  env?: Record<string, string | undefined>;
} = {}): Promise<NativeLearningReceipt> {
  requireLocalDev(options.env ?? process.env);
  if (!own(input, ["documents", "query", "limit"]) || !Array.isArray(input.documents)
    || input.documents.length < 1 || input.documents.length > 20
    || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20
    || typeof input.query !== "string" || !input.query.trim()
    || input.documents.some(v => !own(v, ["reference", "text"]) || typeof v.reference !== "string" || !REF.test(v.reference)
      || typeof v.text !== "string" || !v.text.trim())) error("hf-native-recall-invalid");
  if (new Set(input.documents.map(x=>x.reference)).size !== input.documents.length
    || Buffer.byteLength(JSON.stringify(input), "utf8") > 24_000) error("hf-native-recall-invalid");
  const channel = openTransientResultChannel({ ttlMs: 120_000, ...(options.now ? { now: options.now().getTime() } : {}) });
  const { embeddings, receipt: local } = await generateLocalEmbeddings(
    { texts: [...input.documents.map(x => x.text), input.query] }, { ...options, channel });
  const vector = embeddings[0]!;
  const index = createSemanticIndex({ modelDigest: local.modelDigest, dimensions: vector.vector.length, maximumEntries: 20 });
  input.documents.forEach((entry, i) => index.upsert({ reference: entry.reference, ...embeddings[i]! }));
  const hits = index.search({ ...embeddings[embeddings.length - 1]!, limit: input.limit }).map(x=>({
    reference: x.reference, similarity: Math.round(x.similarity * 10000) / 10000,
  }));
  return receipt("local-recall", "admitted-local-ollama",
    { modelDigest: local.modelDigest, references: hits, queryDigest: hash(input.query),
      documentsCount: input.documents.length, modelExecutionVerified: true,
      responsePersistence: false, promptPersistence: false }, options.now ? options.now() : new Date());
}

/** Compare only actual locally executed, equally scoped benchmarks. Never promotes production. */
export function compareNativeHuggingFaceTrials(receipts: NativeLearningReceipt[]) {
  if (!Array.isArray(receipts) || receipts.length < 2 || receipts.length > 12) error("hf-native-comparison-invalid");
  const trials = receipts.map(item => {
    if (!item || item.kind !== "hf-native-learning" || item.status !== "local-trial"
      || item.source !== "admitted-local-ollama" || item.creditCost !== 0 || item.productionActivated !== false
      || item.fingerprint !== hash({ status: item.status, source: item.source, result: item.result })
      || !item.result || typeof item.result !== "object") error("hf-native-comparison-invalid");
    return item.result as { suiteFingerprint?: string; modelDigest?: string | null; modelExecutionVerified?: boolean; passRate?: number; p95DurationMs?: number };
  });
  const suites = new Set(trials.map(v => v.suiteFingerprint));
  if (suites.size !== 1 || !SHA64.test(trials[0]?.suiteFingerprint ?? "")
    || trials.some(v => v.modelExecutionVerified !== true || !SHA64.test(v.modelDigest || "")
      || typeof v.passRate !== "number" || v.passRate < 0 || v.passRate > 1
      || typeof v.p95DurationMs !== "number" || !Number.isSafeInteger(v.p95DurationMs) || v.p95DurationMs < 0)) error("hf-native-comparison-insufficient-evidence");
  const ranking = trials.map(t=>({ modelDigest:t.modelDigest, passRate:t.passRate, p95DurationMs:t.p95DurationMs }))
    .sort((a,b)=>b.passRate! - a.passRate! || a.p95DurationMs! - b.p95DurationMs! || a.modelDigest!.localeCompare(b.modelDigest!));
  return Object.freeze({ suiteFingerprint:trials[0]!.suiteFingerprint, ranking, recommendedForReview:ranking[0]?.modelDigest,
    activationPerformed:false, independentEvaluatorVerified:false, creditCost:0 });
}
