import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternetEgressController } from '../src/internet-egress.mjs';
import { createInternetEvidencePlane } from '../src/internet-evidence-plane.mjs';

const NOW = '2026-09-07T07:02:00.000Z';

function controller() {
  return createInternetEgressController({
    now: () => new Date(NOW),
    resolveHost: async () => [{ address: '93.184.216.34' }],
    fetchImpl: async () => new Response(
      'Release 2.1 adds deterministic evidence ingestion and bounded provenance receipts.',
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    ),
  });
}

test('Internet Evidence Plane turns public egress into provenance-bound memory without retaining raw bytes', async () => {
  const plane = createInternetEvidencePlane({
    egressController: controller(),
    deriveSignals: ({ bytes }) => {
      assert.ok(Buffer.isBuffer(bytes));
      return [{
        memoryClass: 'observation',
        subject: 'release-notes',
        statement: 'Release 2.1 adds deterministic evidence ingestion.',
        confidence: 0.9,
        freshness: 'current',
      }];
    },
  });

  const result = await plane.ingest({
    objectiveId: 'obj-research-evidence',
    purpose: 'Collect current public release evidence for Mahoraga learning.',
    url: 'https://example.com/releases/2.1',
    capability: 'research-evidence',
    sourceClass: 'official-docs',
    priorContentHashes: [],
  });

  assert.equal(result.record.kind, 'internet-evidence-record');
  assert.equal(result.record.targetHost, 'example.com');
  assert.equal(result.record.sourceClass, 'official-docs');
  assert.equal(result.record.noveltyScore, 1);
  assert.equal(result.record.untrustedSource, true);
  assert.equal(result.record.authority, 'evidence-only');
  assert.equal(result.record.mutationAllowed, false);
  assert.equal(result.record.zeroCredit, true);
  assert.equal(result.record.providerRequired, false);
  assert.equal(result.record.creditCost, 0);
  assert.equal(result.record.paidFallback, false);
  assert.match(result.record.evidenceId, /^evidence-[a-f0-9]{32}$/);
  assert.match(result.record.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.memoryRecords.length, 1);
  assert.equal(result.memoryRecords[0].provenance, 'connected-evidence');
  assert.equal(result.memoryRecords[0].capability, 'research-evidence');
  assert.deepEqual(result.memoryRecords[0].evidenceRefs, [result.record.evidenceId]);
  assert.equal(JSON.stringify(result).includes('Release 2.1 adds deterministic evidence ingestion and bounded provenance receipts.'), false);
  assert.equal(Object.hasOwn(result.record, 'bytes'), false);
});

test('duplicate Internet evidence remains auditable but does not create duplicate institutional memory', async () => {
  const firstPlane = createInternetEvidencePlane({
    egressController: controller(),
    deriveSignals: () => [{
      memoryClass: 'fact',
      subject: 'release-notes',
      statement: 'Release 2.1 is published.',
      confidence: 0.8,
      freshness: 'current',
    }],
  });
  const first = await firstPlane.ingest({
    objectiveId: 'obj-research-evidence',
    purpose: 'Collect public release evidence.',
    url: 'https://example.com/releases/2.1',
    capability: 'research-evidence',
    sourceClass: 'official-docs',
    priorContentHashes: [],
  });

  const replayPlane = createInternetEvidencePlane({
    egressController: controller(),
    deriveSignals: () => [{
      memoryClass: 'fact',
      subject: 'release-notes',
      statement: 'Release 2.1 is published.',
      confidence: 0.8,
      freshness: 'current',
    }],
  });
  const replay = await replayPlane.ingest({
    objectiveId: 'obj-research-evidence',
    purpose: 'Collect public release evidence.',
    url: 'https://example.com/releases/2.1',
    capability: 'research-evidence',
    sourceClass: 'official-docs',
    priorContentHashes: [first.record.contentSha256],
  });

  assert.equal(replay.record.noveltyScore, 0);
  assert.equal(replay.record.duplicate, true);
  assert.equal(replay.memoryRecords.length, 0);
  assert.equal(replay.record.contentSha256, first.record.contentSha256);
});
