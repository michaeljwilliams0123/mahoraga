import { createHash } from 'node:crypto';
// @ts-expect-error Shared governed runtime-neutral planning contract.
import { planWorldStateActions } from '../../src/objective-planner.mjs';

export const INTERNAL_WAKE_MS = 60_000;
export type ActivityObservation = { completedTurns: number; failedTurns: number; pendingTurns: number; recentTurnFingerprint: string; providerReason: string | null };
export type ActivityState = {
 schemaVersion: 1; sourceSha: string; enabled: boolean;
 phase: 'scheduled' | 'watching' | 'planned' | 'held' | 'paused';
 lastWakeAt: number | null; nextWakeAt: number | null; wakeCount: number; artifactCount: number;
 snapshotFingerprint: string | null; artifactFingerprint: string | null;
 candidateActionCount: number; lastError: string | null;
};
export type ActivityArtifact = {
 schemaVersion: 1; kind: 'internal-plan-candidate'; sourceSha: string; createdAt: number;
 snapshotFingerprint: string; fingerprint: string; automaticMutationAllowed: false; modelInvocations: 0;
 actions: { id: string; intent: string; reasonCode: string; priority: string; completionCriteria: string; disposition: 'candidate' }[];
};
export interface ActivityStore {
 load(): ActivityState | null;
 save(value: ActivityState): void;
 archive(value: ActivityArtifact): void;
 transaction<T>(fn: () => T): T;
 getAlarm(): Promise<number | null>;
 setAlarm(value: number): Promise<void>;
 deleteAlarm(): Promise<void>;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clock = (now: number) => { if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('internal-clock-invalid'); };
export function readActivityState(value: unknown): ActivityState {
 const fail = (): never => { throw new TypeError('internal-state-invalid'); };
 if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
 const o = value as Record<string, unknown>;
 if (Object.keys(o).sort().join(',') !== 'artifactCount,artifactFingerprint,candidateActionCount,enabled,lastError,lastWakeAt,nextWakeAt,phase,schemaVersion,snapshotFingerprint,sourceSha,wakeCount'
  || o.schemaVersion !== 1 || typeof o.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(o.sourceSha)
  || typeof o.enabled !== 'boolean' || typeof o.phase !== 'string' || !['scheduled','watching','planned','held','paused'].includes(o.phase)) return fail();
 for (const key of ['wakeCount','artifactCount','candidateActionCount']) if (!Number.isSafeInteger(o[key]) || (o[key] as number) < 0) return fail();
 if ((o.candidateActionCount as number) > 8) return fail();
 for (const key of ['lastWakeAt','nextWakeAt']) if (o[key] !== null && (!Number.isSafeInteger(o[key]) || (o[key] as number) < 0)) return fail();
 for (const key of ['snapshotFingerprint','artifactFingerprint']) if (o[key] !== null && (typeof o[key] !== 'string' || !/^[a-f0-9]{64}$/.test(o[key]))) return fail();
 if (o.lastError !== null && o.lastError !== 'internal-observation-invalid') return fail();
 if ((!o.enabled && (o.phase !== 'paused' || o.nextWakeAt !== null)) || (o.enabled && (o.phase === 'paused' || o.nextWakeAt === null))) return fail();
 return structuredClone(value) as ActivityState;
}
export function summarizeRecentTurns(rows: readonly { id: string; status: string }[]) {
 return { completedTurns: rows.filter(row => row.status === 'SUCCESS').length,
  failedTurns: rows.filter(row => row.status === 'FAILED').length,
  pendingTurns: rows.filter(row => row.status !== 'SUCCESS' && row.status !== 'FAILED').length,
  recentTurnFingerprint: digest(rows.map(row => ({ id: row.id, status: row.status }))) };
}
const validObservation = (value: ActivityObservation) => {
 const counts = [value.completedTurns, value.failedTurns, value.pendingTurns];
 return counts.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 64)
  && counts.reduce((a, b) => a + b, 0) <= 64
  && typeof value.recentTurnFingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.recentTurnFingerprint)
  && (value.providerReason === null || (typeof value.providerReason === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value.providerReason)));
};

/** Persists bounded candidate plans. This loop never invokes models or executes a proposed action. */
export class InternalActivityLoop {
 readonly store: ActivityStore;
 readonly sourceSha: string;
 constructor(store: ActivityStore, sourceSha: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new TypeError('internal-source-invalid');
  this.store = store; this.sourceSha = sourceSha;
 }
 private state(now: number): ActivityState {
  const stored = this.store.load();
  const old = stored === null ? null : readActivityState(stored);
  if (old?.sourceSha === this.sourceSha) return old;
  const enabled = old?.enabled !== false;
  return { schemaVersion: 1, sourceSha: this.sourceSha, enabled, phase: enabled ? 'scheduled' : 'paused',
   lastWakeAt: null, nextWakeAt: enabled ? now + INTERNAL_WAKE_MS : null, wakeCount: 0, artifactCount: 0,
   snapshotFingerprint: null, artifactFingerprint: null, candidateActionCount: 0, lastError: null };
 }
 private async syncAlarm(now: number) {
  const currentAlarm = await this.store.getAlarm();
  const state = this.store.load();
  if (!state?.enabled || state.nextWakeAt === null) { await this.store.deleteAlarm(); return; }
  const due = Math.max(now + 1, state.nextWakeAt);
  if (currentAlarm !== due) await this.store.setAlarm(due);
 }
 async ensureScheduled(now = Date.now()) {
  clock(now);
  this.store.transaction(() => { this.store.save(this.state(now)); });
  await this.syncAlarm(now);
 }
 async control(enabled: boolean, now = Date.now()) {
  clock(now);
  if (typeof enabled !== 'boolean') throw new TypeError('internal-control-invalid');
  this.store.transaction(() => {
   const state = this.state(now);
   this.store.save({ ...state, enabled, phase: enabled ? 'scheduled' : 'paused', nextWakeAt: enabled ? now + INTERNAL_WAKE_MS : null });
  });
  await this.syncAlarm(now);
 }
 async wake(observation: ActivityObservation, now = Date.now()) {
  clock(now);
  this.store.transaction(() => {
   const state = this.state(now);
   if (!state.enabled || state.nextWakeAt === null || now < state.nextWakeAt) { this.store.save(state); return; }
   const next = { ...state, lastWakeAt: now, nextWakeAt: now + INTERNAL_WAKE_MS, wakeCount: state.wakeCount + 1 };
   if (!validObservation(observation)) {
    this.store.save({ ...next, phase: 'held', lastError: 'internal-observation-invalid' }); return;
   }
   const snapshotFingerprint = digest({ sourceSha: this.sourceSha, ...observation });
   if (snapshotFingerprint === state.snapshotFingerprint) {
    this.store.save({ ...next, phase: 'watching', lastError: null }); return;
   }
   const plan = planWorldStateActions({ workers: [], activeLeases: [], objectives: [],
    repository: { verified: false }, taskCounts: { failed: observation.failedTurns },
    providers: observation.providerReason === null ? [] : [{ id: 'cloudflare-workers-ai', error: observation.providerReason }],
   }, { now }) as { actions: { id: string; intent: string; reasonCode: string; priority: string; completionCriteria: string }[] };
   const actions = plan.actions.slice(0, 8).map(a => ({ id: a.id, intent: a.intent, reasonCode: a.reasonCode,
    priority: a.priority, completionCriteria: a.completionCriteria, disposition: 'candidate' as const }));
   const fingerprint = digest({ sourceSha: this.sourceSha, snapshotFingerprint, actions });
   this.store.archive({ schemaVersion: 1, kind: 'internal-plan-candidate', sourceSha: this.sourceSha, createdAt: now,
    snapshotFingerprint, fingerprint, automaticMutationAllowed: false, modelInvocations: 0, actions });
   this.store.save({ ...next, phase: 'planned', snapshotFingerprint, artifactFingerprint: fingerprint,
    candidateActionCount: actions.length, artifactCount: state.artifactCount + 1, lastError: null });
  });
  await this.syncAlarm(now);
 }
}
