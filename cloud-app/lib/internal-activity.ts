export type InternalActivity = Readonly<{
 schemaVersion: 1; sourceSha: string; enabled: boolean; phase: 'scheduled' | 'watching' | 'planned' | 'held' | 'paused';
 lastWakeAt: number | null; nextWakeAt: number | null; wakeCount: number; artifactCount: number; candidateActionCount: number;
 lastError: string | null; snapshotFingerprint: string | null; artifactFingerprint: string | null;
 observedAt: string; durableState: 'cloudflare-do-sqlite'; modelInvocations: 0;
 huggingFaceDiscovery?: { status: 'candidate-metadata-only' | 'metadata-unavailable'; query: string | null; sourceSha: string; observedAt: string;
   nextCheckAt: string; candidates: ReadonlyArray<{ repoId: string; revision: string; license: string; downloads: number;
     admissionState: 'requires-independent-inspection'; modelExecutionVerified: false }> };
}>;
export function parseInternalActivity(value: unknown, expectedSha: unknown, now = Date.now()): InternalActivity | null {
 if (!Number.isFinite(now) || typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedSha) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
 const o = value as Record<string, unknown>;
 const baseline = 'artifactCount,artifactFingerprint,candidateActionCount,durableState,enabled,lastError,lastWakeAt,modelInvocations,nextWakeAt,observedAt,phase,schemaVersion,snapshotFingerprint,sourceSha,wakeCount'.split(',');
 const actual = Object.keys(o).filter(key => key !== 'nativeContinuity' && key !== 'huggingFaceDiscovery').sort();
 if (actual.join(',') !== baseline.join(',')
  || o.schemaVersion !== 1 || o.sourceSha !== expectedSha || typeof o.enabled !== 'boolean'
  || typeof o.phase !== 'string' || !['scheduled','watching','planned','held','paused'].includes(o.phase) || o.modelInvocations !== 0 || o.durableState !== 'cloudflare-do-sqlite') return null;
 for (const key of ['wakeCount','artifactCount','candidateActionCount']) if (!Number.isSafeInteger(o[key]) || (o[key] as number) < 0) return null;
 if ((o.candidateActionCount as number) > 8) return null;
 for (const key of ['lastWakeAt','nextWakeAt']) if (o[key] !== null && (!Number.isSafeInteger(o[key]) || (o[key] as number) < 0)) return null;
 for (const key of ['snapshotFingerprint','artifactFingerprint']) if (o[key] !== null && (typeof o[key] !== 'string' || !/^[a-f0-9]{64}$/.test(o[key]))) return null;
 if (o.lastError !== null && o.lastError !== 'internal-observation-invalid') return null;
 if ((!o.enabled && (o.phase !== 'paused' || o.nextWakeAt !== null)) || (o.enabled && (o.phase === 'paused' || o.nextWakeAt === null))) return null;
 if (typeof o.observedAt !== 'string' || o.observedAt.length > 64) return null;
 const time = Date.parse(o.observedAt);
 if (!Number.isFinite(time) || time > now + 5000 || time <= now - 60000 || (o.lastWakeAt !== null && (o.lastWakeAt as number) > now + 5000)) return null;
 let discovery: InternalActivity['huggingFaceDiscovery'];
 if ('huggingFaceDiscovery' in o && o.huggingFaceDiscovery !== null) {
  const v = o.huggingFaceDiscovery;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (Object.keys(d).sort().join(',') !== 'candidates,creditCost,inferencePerformed,modelAdmissionPerformed,nextCheckAt,observedAt,productionActivated,query,sourceSha,status'
   || !['candidate-metadata-only','metadata-unavailable'].includes(String(d.status))
   || d.creditCost !== 0 || d.inferencePerformed !== false || d.modelAdmissionPerformed !== false
   || d.productionActivated !== false || d.sourceSha !== expectedSha
   || !(d.query === null || ['SmolLM','Qwen','MiniLM'].includes(String(d.query)))
   || typeof d.observedAt !== 'string' || typeof d.nextCheckAt !== 'string'
   || !Number.isFinite(Date.parse(d.observedAt)) || !Number.isFinite(Date.parse(d.nextCheckAt))
   || Date.parse(d.observedAt) > now + 5000 || !Array.isArray(d.candidates) || d.candidates.length > 6) return null;
  for (const candidate of d.candidates) {
   if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
   const c = candidate as Record<string, unknown>;
   if (Object.keys(c).sort().join(',') !== 'admissionState,downloads,license,modelExecutionVerified,repoId,revision'
    || typeof c.repoId !== 'string' || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(c.repoId)
    || typeof c.revision !== 'string' || !/^[a-f0-9]{40}$/.test(c.revision)
    || typeof c.license !== 'string' || c.license.length > 64
    || !Number.isSafeInteger(c.downloads) || (c.downloads as number) < 0
    || c.admissionState !== 'requires-independent-inspection' || c.modelExecutionVerified !== false) return null;
  }
  discovery = { status: d.status as 'candidate-metadata-only' | 'metadata-unavailable',
   query: d.query as string | null, sourceSha: d.sourceSha as string,
   observedAt: d.observedAt, nextCheckAt: d.nextCheckAt, candidates: d.candidates as NonNullable<InternalActivity['huggingFaceDiscovery']>['candidates'] };
 }
 if ('nativeContinuity' in o && o.nativeContinuity !== null
   && (typeof o.nativeContinuity !== 'object' || Array.isArray(o.nativeContinuity))) return null;
 const { nativeContinuity: _ignored, huggingFaceDiscovery: _original, ...base } = o;
 void _ignored; void _original;
 return Object.freeze({ ...structuredClone(base), ...(discovery ? { huggingFaceDiscovery: discovery } : {}) }) as InternalActivity;
}
export function internalActivityLabel(value: InternalActivity | null, now = Date.now()): string {
 if (!value) return 'Background unverified';
 if (!value.enabled) return 'Background paused';
 if (value.phase === 'held') return 'Internal work held';
 if (value.lastWakeAt === null) return value.nextWakeAt !== null && now > value.nextWakeAt + 120000 ? 'Wake delayed' : 'Wake scheduled';
 if (now - value.lastWakeAt >= 180000 || value.nextWakeAt === null || now > value.nextWakeAt + 120000) return 'Wake delayed';
 return 'Background active';
}
