import test from 'node:test';
import assert from 'node:assert/strict';
import { InternalActivityLoop, readActivityState, summarizeRecentTurns, type ActivityState, type ActivityArtifact } from '../deploy/cloudflare-execution-runtime/internal-activity.ts';

const sha = 'a'.repeat(40);
function harness() {
 let state: ActivityState | null = null;
 let alarm: number | null = null;
 const artifacts: ActivityArtifact[] = [];
 const store = {
  load: () => state, save: (value: ActivityState) => { state = structuredClone(value); },
  archive: (value: ActivityArtifact) => { artifacts.push(value); },
  transaction: <T>(fn: () => T) => fn(),
  getAlarm: async () => alarm, setAlarm: async (value: number) => { alarm = value; },
  deleteAlarm: async () => { alarm = null; },
 };
 return { store, artifacts, state: () => state, alarm: () => alarm };
}
const observation = { completedTurns: 3, failedTurns: 1, pendingTurns: 0, recentTurnFingerprint: 'c'.repeat(64), providerReason: 'provider-canary-stale' };
test('corrupt persisted state and private fields cannot become a public observation', async () => {
 const h = harness(); await new InternalActivityLoop(h.store, sha).ensureScheduled(1000);
 assert.throws(() => readActivityState({ ...h.state(), token: 'private' }), /internal-state-invalid/);
 assert.throws(() => readActivityState({ ...h.state(), enabled: false }), /internal-state-invalid/);
 for (const phase of [['scheduled'], { toString: () => 'scheduled' }, 1, null])
  assert.throws(() => readActivityState({ ...h.state(), phase }), /internal-state-invalid/);
});
test('durable wake survives a new loop instance without an open browser or model calls', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 await loop.ensureScheduled(1000); assert.equal(h.alarm(), 61000); assert.equal(h.state()?.lastWakeAt, null);
 await new InternalActivityLoop(h.store, sha).wake(observation, 61000);
 assert.equal(h.state()?.wakeCount, 1); assert.equal(h.alarm(), 121000);
 assert.equal(h.artifacts.length, 1); assert.equal(h.artifacts[0]?.automaticMutationAllowed, false);
 assert.equal(h.artifacts[0]?.modelInvocations, 0);
});
test('duplicate delivery and unchanged observations never fake new work', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 await loop.ensureScheduled(1000); await loop.wake(observation, 61000);
 await loop.wake(observation, 61001); assert.equal(h.state()?.wakeCount, 1);
 await loop.wake(observation, 121000); assert.equal(h.state()?.wakeCount, 2); assert.equal(h.artifacts.length, 1);
 await loop.wake({ ...observation, failedTurns: 2 }, 181000); assert.equal(h.artifacts.length, 2);
});
test('owner pause persists through bootstrap and wake; explicit resume schedules again', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 await loop.ensureScheduled(1000); await loop.control(false, 2000);
 await new InternalActivityLoop(h.store, sha).ensureScheduled(3000); await loop.wake(observation, 100000);
 assert.equal(h.alarm(), null); assert.equal(h.state()?.wakeCount, 0);
 await loop.control(true, 100000); assert.equal(h.alarm(), 160000);
});
test('source changes and invalid observation cannot reuse a candidate as authority', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 await loop.ensureScheduled(1000); await loop.wake(observation, 61000);
 const updated = new InternalActivityLoop(h.store, 'b'.repeat(40)); await updated.ensureScheduled(62000);
 assert.equal(h.state()?.artifactCount, 0); assert.equal(h.state()?.lastWakeAt, null);
 await updated.wake({ ...observation, failedTurns: -1 }, 122000);
 assert.equal(h.state()?.phase, 'held'); assert.equal(h.state()?.lastError, 'internal-observation-invalid');
 assert.equal(h.alarm(), 182000);
});

test('failed candidate persistence leaves the due wake recoverable rather than claiming a build', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 await loop.ensureScheduled(1000);
 const persist = h.store.archive;
 h.store.archive = () => { throw new Error('storage-unavailable'); };
 await assert.rejects(loop.wake(observation, 61000), /storage-unavailable/);
 assert.equal(h.state()?.wakeCount, 0); assert.equal(h.state()?.artifactCount, 0);
 await loop.ensureScheduled(62000); assert.equal(h.alarm(), 62001);
 h.store.archive = persist; await loop.wake(observation, 62001);
 assert.equal(h.state()?.artifactCount, 1); assert.equal(h.alarm(), 122001);
});

test('new turn identities at the same aggregate count trigger an assessment without retaining private metadata', async () => {
 const h = harness(); const loop = new InternalActivityLoop(h.store, sha);
 const old = summarizeRecentTurns([{ id: 'old-private-id', status: 'SUCCESS' }]);
 const fresh = summarizeRecentTurns([{ id: 'new-private-id', status: 'SUCCESS' }]);
 assert.equal(old.completedTurns, fresh.completedTurns); assert.notEqual(old.recentTurnFingerprint, fresh.recentTurnFingerprint);
 await loop.ensureScheduled(1000);
 await loop.wake({ ...old, providerReason: null }, 61000);
 await loop.wake({ ...fresh, providerReason: null }, 121000);
 assert.equal(h.artifacts.length, 2);
 assert.doesNotMatch(JSON.stringify(h.artifacts), /private-id/);
});
