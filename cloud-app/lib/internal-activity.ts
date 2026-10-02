export type InternalActivity = Readonly<{
 schemaVersion: 1; sourceSha: string; enabled: boolean; phase: 'scheduled' | 'watching' | 'planned' | 'held' | 'paused';
 lastWakeAt: number | null; nextWakeAt: number | null; wakeCount: number; artifactCount: number; candidateActionCount: number;
 lastError: string | null; snapshotFingerprint: string | null; artifactFingerprint: string | null;
 observedAt: string; durableState: 'cloudflare-do-sqlite'; modelInvocations: 0;
}>;
export function parseInternalActivity(value: unknown, expectedSha: unknown, now = Date.now()): InternalActivity | null {
 if (!Number.isFinite(now) || typeof expectedSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedSha) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
 const o = value as Record<string, unknown>;
 if (Object.keys(o).sort().join(',') !== 'artifactCount,artifactFingerprint,candidateActionCount,durableState,enabled,lastError,lastWakeAt,modelInvocations,nextWakeAt,observedAt,phase,schemaVersion,snapshotFingerprint,sourceSha,wakeCount'
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
 return Object.freeze(structuredClone(value)) as InternalActivity;
}
export function internalActivityLabel(value: InternalActivity | null, now = Date.now()): string {
 if (!value) return 'Background unverified';
 if (!value.enabled) return 'Background paused';
 if (value.phase === 'held') return 'Internal work held';
 if (value.lastWakeAt === null) return value.nextWakeAt !== null && now > value.nextWakeAt + 120000 ? 'Wake delayed' : 'Wake scheduled';
 if (now - value.lastWakeAt >= 180000 || value.nextWakeAt === null || now > value.nextWakeAt + 120000) return 'Wake delayed';
 return 'Background active';
}
