import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executeCognitiveCapability } from '../src/cognitive-worker.mjs';
import { buildCapabilityRegistry } from '../src/capability-registry.mjs';
import { createCapabilityReceipt, capabilityFamily } from '../src/receipt-registry.mjs';

const manifest = JSON.parse(await readFile(new URL('../mahoraga.manifest.json', import.meta.url), 'utf8'));

test('manifest admits one deterministic cognitive-core worker through the existing router fabric', () => {
  const worker = manifest.workers.find((item) => item.id === 'cognitive-core');
  assert.ok(worker);
  assert.equal(worker.costClass, 'deterministic');
  assert.equal(worker.executionPlane, 'local');
  assert.equal(worker.capabilities.includes('cognitive.cycle'), true);
  const observedAt = '2026-09-15T09:15:00.000Z';
  const readiness = worker.capabilities.map((capability) => ({ capability, processStatus: 'live', providerStatus: 'ready', canaryStatus: 'verified', processObservedAt: observedAt, providerObservedAt: observedAt, canaryVerifiedAt: observedAt, lastErrorCode: null }));
  const routes = buildCapabilityRegistry(manifest, [{ workerId: 'cognitive-core', status: 'healthy', lastHeartbeatAt: observedAt, readiness }], Date.parse(observedAt));
  assert.equal(routes.find((item) => item.capability === 'cognitive.cycle')?.routable, true);
});

test('cognitive worker health produces a normal capability receipt family', async () => {
  const result = await executeCognitiveCapability('cognitive.health', {});
  const receipt = createCapabilityReceipt('cognitive.health', result, { observedAt: '2026-09-15T09:15:00.000Z', durationMs: 1 });
  assert.equal(receipt.outcome, 'succeeded');
  assert.equal(capabilityFamily('cognitive.health'), 'cognitive');
});