import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInternalActivity, internalActivityLabel } from '../lib/internal-activity.ts';
const now = 1790958600000;
const sha = 'a'.repeat(40);
const status = { schemaVersion: 1, sourceSha: sha, enabled: true, phase: 'planned', lastWakeAt: now - 1000,
 nextWakeAt: now + 59000, wakeCount: 2, artifactCount: 1, candidateActionCount: 2, lastError: null,
 snapshotFingerprint: 'b'.repeat(64), artifactFingerprint: 'c'.repeat(64), observedAt: new Date(now).toISOString(), durableState: 'cloudflare-do-sqlite', modelInvocations: 0 };
test('only fresh matching-source durable observations can show background work active', () => {
 const value = parseInternalActivity(status, sha, now); assert.ok(value); assert.equal(internalActivityLabel(value, now), 'Background active');
 for (const bad of [{ ...status, sourceSha: 'd'.repeat(40) }, { ...status, token: 'private' }, { ...status, modelInvocations: 1 }, { ...status, wakeCount: -1 }, { ...status, durableState: 'memory' }, { ...status, observedAt: new Date(now - 61000).toISOString() }]) assert.equal(parseInternalActivity(bad, sha, now), null);
 assert.equal(parseInternalActivity(status, null, now), null);
});
test('late wakes, bootstrap and owner pause never claim constant activity', () => {
 const value = parseInternalActivity(status, sha, now); assert.ok(value);
 assert.equal(internalActivityLabel(value, now + 181000), 'Wake delayed');
 assert.equal(internalActivityLabel({ ...value, phase: 'scheduled', lastWakeAt: null }, now), 'Wake scheduled');
 assert.equal(internalActivityLabel({ ...value, enabled: false, phase: 'paused', nextWakeAt: null }, now), 'Background paused');
 assert.equal(internalActivityLabel(null, now), 'Background unverified');
});
