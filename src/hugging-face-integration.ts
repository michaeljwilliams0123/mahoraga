import { createHash } from "node:crypto";
// @ts-ignore Existing JavaScript supply-chain validator is migration debt.
import { DEFAULT_MODEL_SUPPLY_CHAIN, validateModelSupplyChain, evaluateRuntimeModelAdmission } from "./model-supply-chain.mjs";
// @ts-ignore Existing JavaScript loopback-only provider is migration debt.
import { probeLocalReasoner } from "./local-reasoner-provider.mjs";

const HUB = "https://huggingface.co";
const MAX_RESPONSE_BYTES = 131_072;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const PAPER = /^\d{4}\.\d{4,5}(?:v\d+)?$/;
const CASE_ID = /^[a-z][a-z0-9-]{1,63}$/;

export type HuggingFaceKind = "models" | "papers";
export type HuggingFaceCandidate = {
  repoId: string;
  revision: string | null;
  license: string | null;
  downloads: number;
  gated: boolean;
  private: boolean;
  admissionState: "requires-independent-inspection";
};
export type HuggingFacePaper = { id: string; title: string; publishedAt: string | null };
export type DiscoveryResult =
  | { kind: "models"; candidates: HuggingFaceCandidate[]; count: number; readOnly: true; inferencePerformed: false; creditCost: 0 }
  | { kind: "papers"; papers: HuggingFacePaper[]; count: number; readOnly: true; inferencePerformed: false; creditCost: 0 };
export type HuggingFaceRevisionInspection = {
  repoId: string;
  revision: string;
  revisionVerified: true;
  readOnly: true;
  artifactVerified: false;
  admissionState: "requires-independent-inspection";
  inferencePerformed: false;
  creditCost: 0;
};
export type HuggingFaceArtifactMetadataInspection = {
  repoId: string;
  revision: string;
  artifactPath: string;
  format: "safetensors" | "gguf";
  artifactSha256: string;
  artifactSizeBytes: number;
  artifactMetadataVerified: true;
  artifactVerified: false;
  readOnly: true;
  artifactDownloaded: false;
  admissionState: "requires-independent-inspection";
  inferencePerformed: false;
  creditCost: 0;
};

function fail(code: string): never { throw new Error(code); }
function cleanText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized && normalized.length <= limit ? normalized : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function compareIds(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function safeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? value : null;
}
function artifactFormat(path: string): "safetensors" | "gguf" | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  const format = match?.[1]?.toLowerCase();
  return format === "safetensors" || format === "gguf" ? format : null;
}
function safeArtifactPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > 240
    || value.includes("\\") || value.startsWith("/") || value.includes(":") || value.includes("?") || value.includes("#")) return false;
  return value.split("/").every((part) => part && part !== "." && part !== ".." && /^[A-Za-z0-9._-]+$/.test(part));
}
async function boundedJson(response: Response): Promise<unknown> {
  const announced = response.headers.get("content-length");
  if (announced !== null && Number(announced) > MAX_RESPONSE_BYTES) fail("hf-discovery-response-too-large");
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) fail("hf-discovery-response-too-large");
    try { return JSON.parse(text) as unknown; } catch { return fail("hf-discovery-invalid-json"); }
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) fail("hf-discovery-response-too-large");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { return fail("hf-discovery-invalid-json"); }
}

/** Read-only public Hub discovery. Never passes credentials or uses hosted inference. */
export async function discoverHuggingFace(
  kind: HuggingFaceKind,
  query: string,
  options: { limit?: number; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<DiscoveryResult> {
  const term = cleanText(query, 100);
  const limit = options.limit ?? 10;
  const timeoutMs = options.timeoutMs ?? 4000;
  if (!term || !["models", "papers"].includes(kind) || !Number.isSafeInteger(limit) || limit < 1 || limit > 20
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10_000) fail("hf-discovery-input-invalid");
  const url = new URL(kind === "models" ? "/api/models" : "/api/papers/search", HUB);
  url.searchParams.set(kind === "models" ? "search" : "q", term);
  url.searchParams.set("limit", String(limit));
  if (kind === "models") {
    url.searchParams.set("sort", "downloads");
    // Immutable candidates require the full public model metadata, including sha.
    url.searchParams.set("full", "true");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== HUB))
      fail("hf-discovery-upstream-unavailable");
    const raw = await boundedJson(response);
    if (!Array.isArray(raw)) fail("hf-discovery-invalid-schema");
    if (kind === "models") {
      const candidates: HuggingFaceCandidate[] = raw.slice(0, limit).flatMap((item: unknown) => {
        if (!isRecord(item)) return [];
        const repoId = item.id ?? item.modelId;
        if (typeof repoId !== "string" || !REPO.test(repoId)) return [];
        const taggedLicense = Array.isArray(item.tags)
          ? item.tags.find((tag: unknown) => typeof tag === "string" && tag.startsWith("license:"))
          : null;
        const license = (isRecord(item.cardData) ? item.cardData.license : null)
          ?? item.license ?? (typeof taggedLicense === "string" ? taggedLicense.slice(8) : null);
        return [{
          repoId,
          revision: typeof item.sha === "string" && SHA40.test(item.sha) ? item.sha : null,
          license: typeof license === "string" && /^[a-z0-9][a-z0-9._+\-]{0,63}$/.test(license) ? license : null,
          downloads: safeInteger(item.downloads),
          gated: item.gated !== false && item.gated != null,
          private: item.private === true,
          admissionState: "requires-independent-inspection" as const,
        }];
      });
      return { kind, candidates, count: candidates.length, readOnly: true, inferencePerformed: false, creditCost: 0 };
    }
    const papers: HuggingFacePaper[] = raw.slice(0, limit).flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.id !== "string" || !PAPER.test(item.id)) return [];
      const title = cleanText(item.title, 200);
      return title ? [{ id: item.id, title, publishedAt: timestamp(item.publishedAt ?? item.published_at) }] : [];
    });
    return { kind, papers, count: papers.length, readOnly: true, inferencePerformed: false, creditCost: 0 };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("hf-discovery-")) throw error;
    return fail("hf-discovery-upstream-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirms the public Hub reports the requested immutable revision for one repository.
 * This does not download an artifact or create an admission record.
 */
export async function inspectHuggingFaceRevision(
  repoId: string,
  revision: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HuggingFaceRevisionInspection> {
  const timeoutMs = options.timeoutMs ?? 4000;
  if (!REPO.test(repoId) || !SHA40.test(revision)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10_000) {
    fail("hf-revision-input-invalid");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(
      new URL(`/api/models/${repoId}/revision/${revision}`, HUB),
      {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== HUB)) {
      fail("hf-revision-unverified");
    }
    const raw = await boundedJson(response);
    if (!isRecord(raw) || (raw.id !== repoId && raw.modelId !== repoId)
      || raw.sha !== revision || raw.private === true || raw.gated === true) {
      fail("hf-revision-unverified");
    }
    return {
      repoId,
      revision,
      revisionVerified: true,
      readOnly: true,
      artifactVerified: false,
      admissionState: "requires-independent-inspection",
      inferencePerformed: false,
      creditCost: 0,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "hf-revision-input-invalid") throw error;
    return fail("hf-revision-unverified");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirms public, pinned Hub metadata for one permitted artifact without downloading it.
 * The Hub-provided LFS object ID is not a locally verified artifact hash or an admission.
 */
export async function inspectHuggingFaceArtifactMetadata(
  repoId: string,
  revision: string,
  artifactPath: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HuggingFaceArtifactMetadataInspection> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const format = artifactFormat(artifactPath);
  if (!REPO.test(repoId) || !SHA40.test(revision) || !safeArtifactPath(artifactPath) || !format
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10_000) {
    fail("hf-artifact-input-invalid");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await inspectHuggingFaceRevision(repoId, revision, options);
    const url = new URL(`/api/models/${repoId}/tree/${revision}`, HUB);
    url.searchParams.set("recursive", "false");
    url.searchParams.set("expand", "true");
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== HUB)) {
      fail("hf-artifact-unverified");
    }
    const raw = await boundedJson(response);
    if (!Array.isArray(raw)) fail("hf-artifact-unverified");
    const matches = raw.filter((item): item is Record<string, unknown> => (
      isRecord(item) && item.type === "file" && item.path === artifactPath
    ));
    if (matches.length !== 1) fail("hf-artifact-unverified");
    const item = matches[0]!;
    const lfs = isRecord(item.lfs) ? item.lfs : null;
    const size = item.size;
    if (!lfs || typeof lfs.oid !== "string" || !SHA64.test(lfs.oid)
      || typeof size !== "number" || !Number.isSafeInteger(size) || size < 1
      || typeof lfs.size !== "number" || lfs.size !== size) {
      fail("hf-artifact-unverified");
    }
    return {
      repoId,
      revision,
      artifactPath,
      format,
      artifactSha256: lfs.oid,
      artifactSizeBytes: size,
      artifactMetadataVerified: true,
      artifactVerified: false,
      readOnly: true,
      artifactDownloaded: false,
      admissionState: "requires-independent-inspection",
      inferencePerformed: false,
      creditCost: 0,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "hf-artifact-input-invalid") throw error;
    return fail("hf-artifact-unverified");
  } finally {
    clearTimeout(timer);
  }
}

/** Cross-check candidate provenance AND the existing immutable, inspected admission ledger. */
export function evaluateHuggingFaceAdmission(input: {
  repoId: string;
  revision: string | null;
  artifactSha256: string;
  provider: "ollama" | "lm-studio";
  runtimeDigest: string;
  runtimeSizeBytes: number;
  gated?: boolean;
  private?: boolean;
}, options: { policy?: unknown; now?: Date } = {}) {
  const policy = options.policy ?? DEFAULT_MODEL_SUPPLY_CHAIN;
  try { validateModelSupplyChain(policy, { now: options.now ?? new Date() }); }
  catch { return { admitted: false, reason: "hf-policy-invalid", activationPerformed: false, creditCost: 0 } as const; }
  if (!REPO.test(input.repoId) || !input.revision || !SHA40.test(input.revision)
    || !SHA64.test(input.artifactSha256) || !SHA64.test(input.runtimeDigest.replace(/^sha256:/, ""))
    || !Number.isSafeInteger(input.runtimeSizeBytes) || input.runtimeSizeBytes < 1
    || !["ollama", "lm-studio"].includes(input.provider) || input.gated === true || input.private === true) {
    return { admitted: false, reason: "hf-candidate-ineligible", activationPerformed: false, creditCost: 0 } as const;
  }
  const entries = (policy as { admissions: Array<{
    state: string;
    source: { repository: string; revision: string };
    artifact: { sha256: string };
    runtimeBindings: Array<{ provider: string; digest: string; sizeBytes: number }>;
  }> }).admissions;
  const entry = entries.find(item => item.state === "admitted" && item.source.repository === input.repoId
    && item.source.revision === input.revision && item.artifact.sha256 === input.artifactSha256);
  if (!entry) {
    return { admitted: false, reason: "hf-artifact-not-admitted", activationPerformed: false, creditCost: 0 } as const;
  }
  // Do not allow model A's artifact proof to borrow model B's admitted runtime digest.
  const runtimeDigest = input.runtimeDigest.replace(/^sha256:/, "");
  if (!entry.runtimeBindings.some(binding => binding.provider === input.provider
    && binding.digest === runtimeDigest && binding.sizeBytes === input.runtimeSizeBytes)) {
    return { admitted: false, reason: "hf-runtime-binding-mismatch", activationPerformed: false, creditCost: 0 } as const;
  }
  const verdict = evaluateRuntimeModelAdmission({
    provider: input.provider, digest: input.runtimeDigest, sizeBytes: input.runtimeSizeBytes,
  }, policy, { now: options.now ?? new Date() });
  return {
    admitted: verdict.admitted === true,
    reason: verdict.reason as string,
    activationPerformed: false,
    creditCost: 0,
  } as const;
}

/** Development-only read probe; reuses the canonical Ollama/LM Studio admission code. */
export async function probeHuggingFaceLocalReadiness(options: {
  env?: Record<string, string | undefined>;
  policy?: unknown;
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}) {
  const probe = await probeLocalReasoner({
    env: options.env ?? process.env,
    modelSupplyChain: options.policy ?? DEFAULT_MODEL_SUPPLY_CHAIN,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    status: probe.verified === true && probe.providerHealth.admittedModelCount > 0 ? "model-ready" : "hold",
    admittedModelCount: safeInteger(probe.providerHealth.admittedModelCount),
    inferencePerformed: false,
    executionEnabled: false,
    productionActivated: false,
    creditCost: 0,
  } as const;
}

export type BenchmarkCase = { id: string; expectedSha256: string };
export type BenchmarkObservation = {
  id: string;
  status: "completed" | "failed";
  resultSha256: string | null;
  durationMs: number;
};
/** Offline-only scoring of externally supplied digests. Not proof of live model execution. */
export function scoreHuggingFaceBenchmark(input: {
  cases: BenchmarkCase[];
  observations: BenchmarkObservation[];
  suiteId: string;
}) {
  if (!exactKeys(input, ["cases", "observations", "suiteId"]) || !CASE_ID.test(input.suiteId)
    || !Array.isArray(input.cases) || !Array.isArray(input.observations)
    || input.cases.length < 1 || input.cases.length > 64 || input.cases.length !== input.observations.length)
    fail("hf-benchmark-input-invalid");
  const ids = new Set<string>();
  const expected = new Map<string, string>();
  for (const item of input.cases) {
    if (!exactKeys(item, ["id", "expectedSha256"]) || !CASE_ID.test(item.id)
      || !SHA64.test(item.expectedSha256) || ids.has(item.id))
      fail("hf-benchmark-input-invalid");
    ids.add(item.id);
    expected.set(item.id, item.expectedSha256);
  }
  const seen = new Set<string>();
  let passed = 0;
  let failed = 0;
  let mismatched = 0;
  const latencies: number[] = [];
  for (const item of input.observations) {
    if (!exactKeys(item, ["durationMs", "id", "resultSha256", "status"])
      || !expected.has(item.id) || seen.has(item.id) || !["completed", "failed"].includes(item.status)
      || !Number.isSafeInteger(item.durationMs) || item.durationMs < 0 || item.durationMs > 3_600_000
      || (item.resultSha256 !== null && !SHA64.test(item.resultSha256))
      || (item.status === "completed" && item.resultSha256 === null))
      fail("hf-benchmark-input-invalid");
    seen.add(item.id);
    latencies.push(item.durationMs);
    if (item.status === "failed") failed++;
    else if (item.resultSha256 === expected.get(item.id)) passed++;
    else mismatched++;
  }
  latencies.sort((a, b) => a - b);
  const total = input.cases.length;
  const summary = {
    suiteId: input.suiteId,
    total,
    passed,
    failed,
    mismatched,
    passRate: passed / total,
    failureRate: failed / total,
    medianDurationMs: latencies[Math.floor((total - 1) / 2)]!,
    p95DurationMs: latencies[Math.ceil(total * 0.95) - 1]!,
  };
  return Object.freeze({
    ...summary,
    fingerprintSha256: createHash("sha256").update(JSON.stringify({
      suiteId: input.suiteId,
      cases: [...input.cases].sort(compareIds),
      observations: [...input.observations].sort(compareIds),
    })).digest("hex"),
    evidenceClass: "unverified-offline-score-only",
    modelExecutionVerified: false,
    promotionEligible: false,
    productionActivated: false,
    creditCost: 0,
  });
}
