import { createHash, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
// @ts-expect-error Existing governed JavaScript cognitive contract.
import { runCognitiveLoop } from "./cognitive-loop.mjs";
// @ts-expect-error Existing governed JavaScript identity contract.
import { createCognitiveIndividual, validateCognitiveIndividual } from "./cognitive-individual.mjs";
// @ts-expect-error Existing governed JavaScript calibration contract.
import { scorePredictionOutcome } from "./prediction-calibration.mjs";
// @ts-expect-error Existing governed JavaScript learning contract.
import { promoteVerifiedPredictionLearning } from "./cognitive-learning-bridge.mjs";

type Input = Record<string, unknown>;
type Action = { actionId: string; effects: Record<string, number>; uncertainty: number };
type Cycle = { fingerprint: string; prediction: { predictedState: Record<string, number> }; predictionReceipt: unknown; decision: string; decisionGate: string; [key: string]: unknown };
type Lineage = { parentIndividualId: string; childIndividualId: string; parentFingerprint: string; childFingerprint: string };
export type CloneReceipt = { cloneId: string; candidateId: string; threadId: number; parentInputDigest: string; inputDigest: string; lineage: readonly Lineage[]; cycle: Cycle; fingerprint: string };
export type MitosisReceipt = { schemaVersion: 1; kind: "cognitive-mitosis"; parentInputDigest: string; baseline: Cycle; clones: readonly CloneReceipt[]; cleanedUp: true; creditCost: 0; paidFallback: false; fingerprint: string };
type Limits = { maximumClones?: number; maximumParallel?: number; timeoutMs?: number };
const INPUT_KEYS = ["members", "requiredPerspectiveTags", "positions", "metacognition", "observedState", "stateUncertainty", "proposedAction", "plannerSnapshot", "evidenceLedger", "dissentHistory"];

/** Fixed incumbent code in separate JS heaps. This is not an OS sandbox for untrusted code. */
export async function runCognitiveMitosis({ cognitiveInput, candidates, limits = {}, signal, now = Date.now() }: {
  cognitiveInput: Input; candidates: readonly { id: string; action: Action }[]; limits?: Limits; signal?: AbortSignal; now?: number;
}): Promise<MitosisReceipt> {
  if (!cognitiveInput || typeof cognitiveInput !== "object" || Array.isArray(cognitiveInput) || Object.keys(cognitiveInput).some(key => !INPUT_KEYS.includes(key))) fail("clone-input-fields-invalid");
  assertCloneState(cognitiveInput);
  if (Buffer.byteLength(JSON.stringify(cognitiveInput), "utf8") > 262_144) fail("clone-input-too-large");
  const maximumClones = limits.maximumClones ?? 4, parallel = limits.maximumParallel ?? 2, timeoutMs = limits.timeoutMs ?? 10_000;
  if (Object.keys(limits).some(key => !["maximumClones", "maximumParallel", "timeoutMs"].includes(key)) || !integer(maximumClones, 1, 4) || !integer(parallel, 1, 4) || !integer(timeoutMs, 1, 30_000) || !Number.isFinite(now)) fail("clone-limits-invalid");
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > maximumClones || new Set(candidates.map(item => item.id)).size !== candidates.length) fail("clone-candidates-invalid");
  for (const candidate of candidates) {
    if (!candidate || Object.keys(candidate).sort().join(",") !== "action,id" || !/^[a-z][a-z0-9-]{0,63}$/.test(candidate.id) || !candidate.action || Object.keys(candidate.action).sort().join(",") !== "actionId,effects,uncertainty") fail("clone-candidates-invalid");
    assertCloneState(candidate);
  }
  if (signal?.aborted) fail("clone-cancelled");
  const snapshot = structuredClone(cognitiveInput), parentInputDigest = digest(snapshot);
  const baseline = runCognitiveLoop(snapshot, { now }) as Cycle;
  const local = new AbortController(), abort = () => local.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) local.abort();
  const clones: CloneReceipt[] = [];
  try {
    for (let index = 0; index < candidates.length; index += parallel) {
      if (local.signal.aborted) fail("clone-cancelled");
      const jobs = candidates.slice(index, index + parallel).map(candidate => {
        const cloneId = `clone-${randomUUID()}`;
        const input = { ...structuredClone(snapshot), proposedAction: structuredClone(candidate.action) };
        // Validate proposed actions before launching any job in this wave.
        runCognitiveLoop(input, { now });
        return { cloneId, candidateId: candidate.id, input, parentInputDigest, now };
      });
      const outcomes = await Promise.allSettled(jobs.map(job => executeThread(job, timeoutMs, local.signal).catch(error => { local.abort(); throw error; })));
      const failure = outcomes.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      for (const outcome of outcomes) if (outcome.status === "fulfilled") clones.push(outcome.value);
    }
    const core = { schemaVersion: 1 as const, kind: "cognitive-mitosis" as const, parentInputDigest, baseline, clones, cleanedUp: true as const, creditCost: 0 as const, paidFallback: false as const };
    return freeze({ ...core, fingerprint: digest(core) });
  } finally { local.abort(); signal?.removeEventListener("abort", abort); }
}

type CloneJob = { cloneId: string; candidateId: string; input: Input; parentInputDigest: string; now: number };
export function executeCloneJob(job: CloneJob, threadId: number): CloneReceipt {
  if (!integer(threadId, 1, Number.MAX_SAFE_INTEGER)) fail("clone-thread-required");
  const input = structuredClone(job.input);
  const ids = new Map<string, string>();
  const lineage: Lineage[] = [];
  if (!Array.isArray(input.members) || !Array.isArray(input.positions)) fail("clone-input-invalid");
  input.members = input.members.map(raw => {
    const parent = validateCognitiveIndividual(raw);
    const childId = `${job.cloneId.slice(0, 42)}-${lineage.length}`;
    const child = createCognitiveIndividual({ ...parent, individualId: childId, parentAgentId: parent.individualId }, { observedAt: new Date(job.now).toISOString() });
    ids.set(parent.individualId, child.individualId);
    lineage.push({ parentIndividualId: parent.individualId, childIndividualId: child.individualId, parentFingerprint: parent.fingerprint, childFingerprint: child.fingerprint });
    return child;
  });
  input.positions = input.positions.map(raw => {
    const position = raw as Record<string, unknown>;
    if (!ids.has(String(position.individualId))) fail("clone-position-invalid");
    return { ...position, individualId: ids.get(String(position.individualId)) };
  });
  const cycle = runCognitiveLoop(input, { now: job.now }) as Cycle;
  const core = { cloneId: job.cloneId, candidateId: job.candidateId, threadId, parentInputDigest: job.parentInputDigest, inputDigest: digest(input), lineage, cycle };
  return { ...core, fingerprint: digest(core) };
}

async function executeThread(job: CloneJob, timeoutMs: number, signal: AbortSignal): Promise<CloneReceipt> {
  if (signal.aborted) fail("clone-cancelled");
  const worker = new Worker(new URL("./cognitive-clone-worker.ts", import.meta.url), {
    workerData: job, env: {}, execArgv: [], stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
  });
  worker.stdout.resume(); worker.stderr.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<CloneReceipt>((resolve, reject) => {
      abort = () => reject(new Error("clone-cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => reject(new Error("clone-timeout")), timeoutMs);
      worker.once("error", () => reject(new Error("clone-worker-failed")));
      worker.once("exit", code => reject(new Error(`clone-exited-without-result:${code}`)));
      worker.once("message", (raw: CloneReceipt) => {
        try {
          const { fingerprint, ...core } = raw;
          if (fingerprint !== digest(core) || raw.cloneId !== job.cloneId || raw.candidateId !== job.candidateId || raw.parentInputDigest !== job.parentInputDigest || raw.threadId !== worker.threadId) fail("clone-result-mismatch");
          resolve(raw);
        } catch { reject(new Error("clone-result-mismatch")); }
      });
    });
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}

/** Observation arrives after execution; candidates never award their own success score. */
export function evaluateCognitiveClones(run: MitosisReceipt, { observedState, observedAt, verification }: {
  observedState: Record<string, number>; observedAt: string; verification?: { verified: boolean; sourceFingerprint: string; evidenceRefs: readonly string[] };
}) {
  const { fingerprint, ...core } = run;
  if (fingerprint !== digest(core) || run.kind !== "cognitive-mitosis" || run.cleanedUp !== true || !run.clones.length) fail("clone-run-invalid");
  const baselineOutcome = scorePredictionOutcome(run.baseline.predictionReceipt, observedState, { observedAt: () => new Date(observedAt) });
  const candidates = run.clones.map(clone => ({ cloneId: clone.cloneId, cycle: clone.cycle, outcome: scorePredictionOutcome(clone.cycle.predictionReceipt, observedState, { observedAt: () => new Date(observedAt) }) }))
    .sort((a, b) => b.outcome.observedAccuracy - a.outcome.observedAccuracy || a.outcome.calibrationGap - b.outcome.calibrationGap || a.cloneId.localeCompare(b.cloneId));
  const winner = candidates[0]!;
  if (verification && verification.sourceFingerprint !== winner.cycle.fingerprint) fail("clone-verification-mismatch");
  const eligible = winner.outcome.observedAccuracy > baselineOutcome.observedAccuracy && winner.cycle.decision !== "hold" && winner.cycle.decisionGate === "admitted" && verification?.verified === true && verification.evidenceRefs.length > 0;
  const learning = promoteVerifiedPredictionLearning({ outcome: winner.outcome, observedAt, verification: { verified: eligible, sourceFingerprint: winner.outcome.fingerprint, evidenceRefs: verification?.evidenceRefs ?? [] } });
  return freeze({ selectedCloneId: winner.cloneId, baselineOutcome, candidates, learning, parentStateChanged: false, authoritySource: "existing-router-and-owner-authority" });
}
function integer(value: number, min: number, max: number): boolean { return Number.isSafeInteger(value) && value >= min && value <= max; }
function assertCloneState(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 32) fail("clone-state-not-json");
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
  if (!value || typeof value !== "object" || seen.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail("clone-state-not-json");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:credentials?|secrets?|tokens?|authorization|password|clientsecret|connectionstring|executable|execargv|env)$/i.test(key.replace(/[_-]/g, ""))) fail("clone-sensitive-state-forbidden");
    assertCloneState(child, depth + 1, seen);
  }
  seen.delete(value);
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function fail(code: string): never { throw new TypeError(code); }
