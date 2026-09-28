import { createHash } from "node:crypto";
import { validateInvestigationReceipt, type CognitiveInvestigationReceipt } from "./cognitive-investigation.ts";

export type WorkerRole = "clone" | "reconstruction";
export type LifecycleState = "requested" | "clone-deployed" | "baseline-proven" | "clone-retired" | "researching" | "research-complete" | "reconstruction-deployed" | "reconstruction-proven" | "absorption-evaluated" | "reconstruction-retired" | "cleanup-required";
type WorkerRecord = Readonly<{ role: WorkerRole; name: string; deploymentId: string; expiresAt: string; retirementFingerprint: string | null; inventoryAbsent: boolean }>;
type TransitionRecord = Readonly<{ from: LifecycleState; to: LifecycleState; observedAt: string; fingerprint: string }>;
export type LifecycleRunInput = Readonly<{ runId: string; sourceSha: string; requestedAt: string }>;
export type LifecycleTransition = Readonly<{
  to: Exclude<LifecycleState, "requested" | "cleanup-required">;
  runId: string;
  sourceSha: string;
  observedAt: string;
  worker?: Readonly<{ role: WorkerRole; deploymentId: string; expiresAt: string }>;
  workerRole?: WorkerRole;
  evaluationFingerprint?: string;
  retirementFingerprint?: string;
  inventoryAbsent?: boolean;
  investigation?: CognitiveInvestigationReceipt;
  comparisonFingerprint?: string;
  absorptionFingerprint?: string;
}>;
export type LifecycleFailure = Readonly<{ observedAt: string; reasonCode: string; orphanWorkerNames: readonly string[] }>;
export type CleanupEvidence = Readonly<{ observedAt: string; absentWorkerNames: readonly string[] }>;
export type LifecycleRun = Readonly<{
  schemaVersion: 1;
  kind: "curious-lifecycle-run";
  runId: string;
  sourceSha: string;
  state: LifecycleState;
  requestedAt: string;
  workers: readonly WorkerRecord[];
  transitions: readonly TransitionRecord[];
  baselineFingerprint: string | null;
  investigationFingerprint: string | null;
  reconstructionFingerprint: string | null;
  comparisonFingerprint: string | null;
  absorptionFingerprint: string | null;
  failureReason: string | null;
  orphanWorkerNames: readonly string[];
  predecessorFingerprint: string;
  fingerprint: string;
}>;
export type LifecycleReceipt = Readonly<{
  schemaVersion: 1;
  kind: "curious-lifecycle-receipt";
  runId: string;
  sourceSha: string;
  state: "complete" | "failed";
  cleanupStatus: "complete";
  observedAt: string;
  workers: readonly WorkerRecord[];
  transitions: readonly (TransitionRecord | Readonly<{ from: LifecycleState; to: "complete" | "failed"; observedAt: string; fingerprint: string }>)[];
  baselineFingerprint: string | null;
  investigationFingerprint: string | null;
  reconstructionFingerprint: string | null;
  comparisonFingerprint: string | null;
  absorptionFingerprint: string | null;
  failureReason: string | null;
  absenceEvidence: readonly string[];
  predecessorFingerprint: string;
  fingerprint: string;
}>;

const NEXT: Readonly<Record<Exclude<LifecycleState, "cleanup-required">, LifecycleState | null>> = Object.freeze({
  requested: "clone-deployed", "clone-deployed": "baseline-proven", "baseline-proven": "clone-retired",
  "clone-retired": "researching", researching: "research-complete", "research-complete": "reconstruction-deployed",
  "reconstruction-deployed": "reconstruction-proven", "reconstruction-proven": "absorption-evaluated",
  "absorption-evaluated": "reconstruction-retired", "reconstruction-retired": null,
});

export function workerNameFor(runId: string, role: WorkerRole): string {
  return `mahoraga-lifecycle-test-${runIdValue(runId)}-${role}`;
}

export function createLifecycleRun(input: LifecycleRunInput): LifecycleRun {
  const core = {
    schemaVersion: 1 as const, kind: "curious-lifecycle-run" as const, runId: runIdValue(input.runId), sourceSha: sourceSha(input.sourceSha),
    state: "requested" as const, requestedAt: timestamp(input.requestedAt), workers: [] as WorkerRecord[], transitions: [] as TransitionRecord[],
    baselineFingerprint: null, investigationFingerprint: null, reconstructionFingerprint: null, comparisonFingerprint: null,
    absorptionFingerprint: null, failureReason: null, orphanWorkerNames: [] as string[], predecessorFingerprint: "0".repeat(64),
  };
  return freeze({ ...core, fingerprint: digest(core) });
}

export function advanceLifecycle(run: LifecycleRun, transition: LifecycleTransition): LifecycleRun {
  validateRun(run);
  if (transition.runId !== run.runId) fail("lifecycle-run-binding-invalid");
  if (transition.sourceSha !== run.sourceSha) fail("lifecycle-source-binding-invalid");
  if (run.state === "cleanup-required" || NEXT[run.state] !== transition.to) fail("lifecycle-transition-out-of-order");
  const observedAt = timestamp(transition.observedAt);
  const next = mutable(run);
  if (transition.to === "clone-deployed" || transition.to === "reconstruction-deployed") {
    if (!transition.worker || transition.worker.role !== (transition.to === "clone-deployed" ? "clone" : "reconstruction")) fail("lifecycle-worker-role-invalid");
    if (next.workers.length >= 2 || next.workers.some((item) => item.role === transition.worker?.role)) fail("lifecycle-worker-limit-exceeded");
    const expiresAt = timestamp(transition.worker.expiresAt);
    if (Date.parse(expiresAt) <= Date.parse(observedAt)) fail("lifecycle-worker-expired");
    next.workers.push(freeze({ role: transition.worker.role, name: workerNameFor(run.runId, transition.worker.role), deploymentId: slug(transition.worker.deploymentId, "lifecycle-deployment-id-invalid"), expiresAt, retirementFingerprint: null, inventoryAbsent: false }));
  }
  if (transition.to === "baseline-proven") next.baselineFingerprint = sha256(transition.evaluationFingerprint);
  if (transition.to === "research-complete") {
    if (!transition.investigation) fail("lifecycle-investigation-required");
    const investigation = validateInvestigationReceipt(transition.investigation);
    if (investigation.runId !== run.runId || investigation.sourceSha !== run.sourceSha) fail("lifecycle-investigation-binding-invalid");
    next.investigationFingerprint = investigation.fingerprint;
  }
  if (transition.to === "reconstruction-proven") next.reconstructionFingerprint = sha256(transition.evaluationFingerprint);
  if (transition.to === "absorption-evaluated") { next.comparisonFingerprint = sha256(transition.comparisonFingerprint); next.absorptionFingerprint = sha256(transition.absorptionFingerprint); }
  if (transition.to === "clone-retired" || transition.to === "reconstruction-retired") {
    const role: WorkerRole = transition.to === "clone-retired" ? "clone" : "reconstruction";
    if (transition.workerRole !== role || transition.inventoryAbsent !== true) fail("lifecycle-retirement-evidence-invalid");
    const index = next.workers.findIndex((item) => item.role === role);
    if (index < 0) fail("lifecycle-worker-missing");
    const worker = next.workers[index];
    if (!worker) fail("lifecycle-worker-missing");
    next.workers[index] = freeze({ ...worker, retirementFingerprint: sha256(transition.retirementFingerprint), inventoryAbsent: true });
  }
  const transitionCore = { from: run.state, to: transition.to, observedAt, predecessorFingerprint: run.fingerprint };
  next.transitions.push(freeze({ from: run.state, to: transition.to, observedAt, fingerprint: digest(transitionCore) }));
  next.state = transition.to;
  return sealRun(next, run.fingerprint);
}

export function markLifecycleFailure(run: LifecycleRun, failure: LifecycleFailure): LifecycleRun {
  validateRun(run); timestamp(failure.observedAt);
  const owned = new Set(run.workers.map((worker) => worker.name));
  if (failure.orphanWorkerNames.some((name) => !owned.has(name))) fail("lifecycle-orphan-unowned");
  const next = mutable(run); next.state = "cleanup-required"; next.failureReason = slug(failure.reasonCode, "lifecycle-failure-invalid"); next.orphanWorkerNames = [...failure.orphanWorkerNames];
  return sealRun(next, run.fingerprint);
}

export function finalizeLifecycle(run: LifecycleRun, cleanup: CleanupEvidence): LifecycleReceipt {
  validateRun(run); const observedAt = timestamp(cleanup.observedAt);
  const expected = run.workers.map((worker) => worker.name).sort();
  const absent = [...new Set(cleanup.absentWorkerNames)].sort();
  if (expected.length === 0 || expected.some((name) => !absent.includes(name))) fail("lifecycle-cleanup-incomplete");
  if (run.state !== "reconstruction-retired" && run.state !== "cleanup-required") fail("lifecycle-finalize-state-invalid");
  if (run.state === "reconstruction-retired" && run.workers.some((worker) => !worker.inventoryAbsent || worker.retirementFingerprint === null)) fail("lifecycle-cleanup-incomplete");
  const finalState = run.state === "reconstruction-retired" ? "complete" as const : "failed" as const;
  const finalTransitionCore = { from: run.state, to: finalState, observedAt, predecessorFingerprint: run.fingerprint };
  const transitions = [...run.transitions, freeze({ from: run.state, to: finalState, observedAt, fingerprint: digest(finalTransitionCore) })];
  const core = {
    schemaVersion: 1 as const, kind: "curious-lifecycle-receipt" as const, runId: run.runId, sourceSha: run.sourceSha,
    state: finalState, cleanupStatus: "complete" as const,
    observedAt, workers: run.workers, transitions, baselineFingerprint: run.baselineFingerprint,
    investigationFingerprint: run.investigationFingerprint, reconstructionFingerprint: run.reconstructionFingerprint,
    comparisonFingerprint: run.comparisonFingerprint, absorptionFingerprint: run.absorptionFingerprint, failureReason: run.failureReason,
    absenceEvidence: absent, predecessorFingerprint: run.fingerprint,
  };
  return freeze({ ...core, fingerprint: digest(core) });
}

export function validateLifecycleReceipt(value: unknown): LifecycleReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("lifecycle-receipt-invalid");
  const record = value as LifecycleReceipt;
  const { fingerprint, ...core } = record;
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || digest(core) !== fingerprint) fail("lifecycle-fingerprint-invalid");
  if (record.schemaVersion !== 1 || record.kind !== "curious-lifecycle-receipt" || record.cleanupStatus !== "complete") fail("lifecycle-receipt-invalid");
  const keys = ["schemaVersion", "kind", "runId", "sourceSha", "state", "cleanupStatus", "observedAt", "workers", "transitions", "baselineFingerprint", "investigationFingerprint", "reconstructionFingerprint", "comparisonFingerprint", "absorptionFingerprint", "failureReason", "absenceEvidence", "predecessorFingerprint", "fingerprint"];
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) fail("lifecycle-receipt-invalid");
  if (!/^[a-z0-9]{12,32}$/.test(record.runId) || !/^[a-f0-9]{40}$/.test(record.sourceSha) || !Number.isFinite(Date.parse(record.observedAt)) || !/^[a-f0-9]{64}$/.test(record.predecessorFingerprint)) fail("lifecycle-receipt-invalid");
  if (!Array.isArray(record.workers) || !Array.isArray(record.transitions) || !Array.isArray(record.absenceEvidence)) fail("lifecycle-receipt-invalid");
  if (record.state === "complete") {
    const roles: WorkerRole[] = ["clone", "reconstruction"];
    if (record.workers.length !== 2 || record.failureReason !== null ||
      [record.baselineFingerprint, record.investigationFingerprint, record.reconstructionFingerprint, record.comparisonFingerprint, record.absorptionFingerprint].some(item => typeof item !== "string" || !/^[a-f0-9]{64}$/.test(item))) fail("lifecycle-receipt-invalid");
    for (let i = 0; i < roles.length; i++) {
      const worker = record.workers[i];
      if (!worker || worker.role !== roles[i] || worker.name !== workerNameFor(record.runId, worker.role) || !worker.inventoryAbsent || !/^[a-f0-9]{64}$/.test(worker.retirementFingerprint ?? "") || !worker.deploymentId || !Number.isFinite(Date.parse(worker.expiresAt))) fail("lifecycle-receipt-invalid");
    }
    const names = record.workers.map(worker => worker.name).sort();
    if (JSON.stringify([...record.absenceEvidence].sort()) !== JSON.stringify(names) || new Set(record.absenceEvidence).size !== 2) fail("lifecycle-receipt-invalid");
    const order = ["requested", "clone-deployed", "baseline-proven", "clone-retired", "researching", "research-complete", "reconstruction-deployed", "reconstruction-proven", "absorption-evaluated", "reconstruction-retired", "complete"];
    if (record.transitions.length !== order.length - 1 || record.transitions.some((transition, index) => transition.from !== order[index] || transition.to !== order[index + 1] || !/^[a-f0-9]{64}$/.test(transition.fingerprint))) fail("lifecycle-receipt-invalid");
    const final = record.transitions.at(-1)!;
    if (final.fingerprint !== digest({ from: "reconstruction-retired", to: "complete", observedAt: record.observedAt, predecessorFingerprint: record.predecessorFingerprint })) fail("lifecycle-receipt-invalid");
  } else if (record.state === "failed") {
    if (record.workers.length < 1 || record.workers.length > 2 || typeof record.failureReason !== "string" || !record.failureReason || record.transitions.length < 2) fail("lifecycle-receipt-invalid");
    const names = record.workers.map(worker => worker.name).sort();
    if (record.workers.some((worker, index) => worker.role !== (["clone", "reconstruction"] as const)[index] || worker.name !== workerNameFor(record.runId, worker.role)) || JSON.stringify([...record.absenceEvidence].sort()) !== JSON.stringify(names) || new Set(record.absenceEvidence).size !== names.length) fail("lifecycle-receipt-invalid");
    const order = ["requested", "clone-deployed", "baseline-proven", "clone-retired", "researching", "research-complete", "reconstruction-deployed", "reconstruction-proven", "absorption-evaluated", "reconstruction-retired"];
    if (record.transitions.slice(0, -1).some((transition, index) => transition.from !== order[index] || transition.to !== order[index + 1])) fail("lifecycle-receipt-invalid");
    const final = record.transitions.at(-1)!;
    if (final.from !== "cleanup-required" || final.to !== "failed" || final.fingerprint !== digest({ from: "cleanup-required", to: "failed", observedAt: record.observedAt, predecessorFingerprint: record.predecessorFingerprint })) fail("lifecycle-receipt-invalid");
  } else fail("lifecycle-receipt-invalid");
  return freeze(record);
}

function validateRun(run: LifecycleRun): void {
  if (!run || run.schemaVersion !== 1 || run.kind !== "curious-lifecycle-run") fail("lifecycle-run-invalid");
  const { fingerprint, ...core } = run;
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || digest(core) !== fingerprint) fail("lifecycle-fingerprint-invalid");
}
function mutable(run: LifecycleRun) { return { ...run, workers: [...run.workers], transitions: [...run.transitions], orphanWorkerNames: [...run.orphanWorkerNames] } as { -readonly [K in keyof LifecycleRun]: LifecycleRun[K] } & { workers: WorkerRecord[]; transitions: TransitionRecord[]; orphanWorkerNames: string[] }; }
function sealRun(value: ReturnType<typeof mutable>, predecessorFingerprint: string): LifecycleRun { const { fingerprint: _ignored, ...rest } = value; const core = { ...rest, predecessorFingerprint }; return freeze({ ...core, fingerprint: digest(core) }); }
function runIdValue(value: string): string { if (!/^[a-z0-9]{12,32}$/.test(value)) fail("lifecycle-run-id-invalid"); return value; }
function sourceSha(value: string): string { if (!/^[a-f0-9]{40}$/.test(value)) fail("lifecycle-source-sha-invalid"); return value; }
function sha256(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("lifecycle-digest-invalid"); return value; }
function slug(value: string, code: string): string { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{1,127}$/.test(value)) fail(code); return value; }
function timestamp(value: string): string { const date = new Date(value); if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail("lifecycle-timestamp-invalid"); return value; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function fail(code: string): never { const error = new TypeError(code); (error as TypeError & { code: string }).code = code; throw error; }
