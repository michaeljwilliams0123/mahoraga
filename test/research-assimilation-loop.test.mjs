import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstitutionalMemoryRecord } from '../src/institutional-memory.mjs';
import { runResearchAssimilation } from '../src/research-assimilation-loop.mjs';
import { asHeartbeatCliReceipt, runUnattendedCreditFreeCycle } from '../src/unattended-credit-free-cycle.mjs';

const NOW = '2026-09-07T15:00:00.000Z';
const CONTENT_HASH = 'c'.repeat(64);
const EVIDENCE_ID = `evidence-${'b'.repeat(32)}`;

function objective() {
  return {
    objectiveId: 'obj-research-evidence',
    capability: 'research-evidence',
    priority: 'critical',
    state: 'open',
  };
}

function source() {
  return {
    sourceId: 'official-release-feed',
    url: 'https://example.com/releases',
    capability: 'research-evidence',
    sourceClass: 'official-docs',
    refreshMinutes: 60,
    maximumBytes: 100_000,
  };
}

function learnedMemory() {
  return createInstitutionalMemoryRecord({
    memoryClass: 'knowledge',
    subject: 'release-pattern',
    statement: 'A verified release signal changed the known capability surface.',
    provenance: 'connected-evidence',
    confidence: 0.9,
    freshness: 'current',
    objectiveIds: ['obj-research-evidence'],
    evidenceRefs: [EVIDENCE_ID],
    capability: 'research-evidence',
    supersedes: [],
  }, { observedAt: NOW });
}

function evidencePlane() {
  return {
    async ingest() {
      return {
        schemaVersion: 1,
        kind: 'internet-evidence-ingest-result',
        record: {
          schemaVersion: 1,
          kind: 'internet-evidence-record',
          evidenceId: EVIDENCE_ID,
          contentSha256: CONTENT_HASH,
          observedAt: NOW,
          duplicate: false,
        },
        memoryRecords: [learnedMemory()],
        zeroCredit: true,
        providerRequired: false,
        creditCost: 0,
        paidFallback: false,
      };
    },
  };
}

test('research assimilation advances source history and promotes derived evidence into institutional memory at $0', async () => {
  const result = await runResearchAssimilation({
    objectives: [objective()],
    sources: [source()],
    history: [],
    existingMemoryRecords: [],
    now: NOW,
    networkAvailable: true,
    evidencePlane: evidencePlane(),
  });

  assert.equal(result.kind, 'research-assimilation');
  assert.equal(result.plan.status, 'ready');
  assert.equal(result.run.completedCount, 1);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].sourceId, 'official-release-feed');
  assert.equal(result.history[0].objectiveId, 'obj-research-evidence');
  assert.equal(result.history[0].bootstrapCompleted, true);
  assert.equal(result.history[0].lastFetchedAt, NOW);
  assert.deepEqual(result.history[0].contentHashes, [CONTENT_HASH]);
  assert.ok(result.memory.activeMemoryIds.includes(learnedMemory().memoryId));
  assert.equal(result.newMemoryIds.length, 1);
  assert.equal(result.evidenceIds[0], EVIDENCE_ID);
  assert.equal(result.zeroCredit, true);
  assert.equal(result.providerRequired, false);
  assert.equal(result.creditCost, 0);
  assert.equal(result.paidFallback, false);
  assert.equal(JSON.stringify(result).includes('bytes'), false);
});

test('unattended cycle can assimilate Internet evidence before growth compounding without making research a provider dependency', async () => {
  const cycle = await runUnattendedCreditFreeCycle({
    now: new Date(NOW),
    world: { openIssues: 0, openPulls: 0 },
    research: {
      objectives: [objective()],
      sources: [source()],
      history: [],
      networkAvailable: true,
      evidencePlane: evidencePlane(),
    },
  });

  const learnedId = learnedMemory().memoryId;
  assert.equal(cycle.research.kind, 'research-assimilation');
  assert.equal(cycle.research.run.completedCount, 1);
  assert.ok(cycle.research.memory.activeMemoryIds.includes(learnedId));
  assert.ok(cycle.growth.memory.activeMemoryIds.includes(learnedId));
  assert.equal(cycle.creditCost, 0);
  assert.equal(cycle.paidFallback, false);

  const receipt = asHeartbeatCliReceipt(cycle);
  assert.equal(receipt.unattended.research.kind, 'research-assimilation-summary');
  assert.equal(receipt.unattended.research.completedCount, 1);
  assert.equal(receipt.unattended.research.newMemoryCount, 1);
  assert.equal(receipt.unattended.research.zeroCredit, true);
  assert.equal(JSON.stringify(receipt.unattended.research).includes('release-pattern'), false);
  assert.equal(JSON.stringify(receipt.unattended.research).includes('verified release signal'), false);
});
