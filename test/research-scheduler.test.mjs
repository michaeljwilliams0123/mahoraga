import test from 'node:test';
import assert from 'node:assert/strict';
import { planResearchJobs, runResearchJobs } from '../src/research-scheduler.mjs';

const NOW = '2026-09-07T07:10:00.000Z';
const HASH = 'a'.repeat(64);

function source({
  sourceId = 'official-release-feed',
  url = 'https://example.com/releases',
  capability = 'research-evidence',
  sourceClass = 'official-docs',
  refreshMinutes = 60,
  maximumBytes = 100_000,
} = {}) {
  return { sourceId, url, capability, sourceClass, refreshMinutes, maximumBytes };
}

function objective({
  objectiveId = 'obj-research-evidence',
  capability = 'research-evidence',
  priority = 'critical',
  state = 'open',
} = {}) {
  return { objectiveId, capability, priority, state };
}

test('research scheduler bootstraps history before switching to delta refresh', () => {
  const bootstrap = planResearchJobs({
    objectives: [objective()],
    sources: [source()],
    history: [],
    now: NOW,
    networkAvailable: true,
  });

  assert.equal(bootstrap.status, 'ready');
  assert.equal(bootstrap.jobs.length, 1);
  assert.equal(bootstrap.jobs[0].phase, 'historical-bootstrap');
  assert.equal(bootstrap.jobs[0].sourceId, 'official-release-feed');
  assert.equal(bootstrap.jobs[0].objectiveId, 'obj-research-evidence');
  assert.equal(bootstrap.jobs[0].url, 'https://example.com/releases');
  assert.deepEqual(bootstrap.jobs[0].priorContentHashes, []);
  assert.equal(bootstrap.jobs[0].authority, 'evidence-only');
  assert.equal(bootstrap.jobs[0].mutationAllowed, false);
  assert.equal(bootstrap.jobs[0].zeroCredit, true);
  assert.equal(bootstrap.jobs[0].providerRequired, false);
  assert.equal(bootstrap.creditCost, 0);
  assert.equal(bootstrap.paidFallback, false);
  assert.match(bootstrap.jobs[0].jobId, /^research-[a-f0-9]{32}$/);

  const delta = planResearchJobs({
    objectives: [objective()],
    sources: [source()],
    history: [{
      sourceId: 'official-release-feed',
      objectiveId: 'obj-research-evidence',
      bootstrapCompleted: true,
      lastFetchedAt: '2026-09-07T05:00:00.000Z',
      contentHashes: [HASH],
    }],
    now: NOW,
    networkAvailable: true,
  });

  assert.equal(delta.jobs.length, 1);
  assert.equal(delta.jobs[0].phase, 'delta-refresh');
  assert.deepEqual(delta.jobs[0].priorContentHashes, [HASH]);
});

test('research scheduler enforces cadence, relevance, backpressure, and offline hold at zero credit', () => {
  const notDue = planResearchJobs({
    objectives: [objective()],
    sources: [source()],
    history: [{
      sourceId: 'official-release-feed',
      objectiveId: 'obj-research-evidence',
      bootstrapCompleted: true,
      lastFetchedAt: '2026-09-07T06:30:00.000Z',
      contentHashes: [HASH],
    }],
    now: NOW,
    networkAvailable: true,
  });
  assert.equal(notDue.status, 'idle');
  assert.deepEqual(notDue.jobs, []);

  const limited = planResearchJobs({
    objectives: [objective()],
    sources: [
      source({ sourceId: 'a-release-feed', url: 'https://a.example.com/releases', maximumBytes: 80_000 }),
      source({ sourceId: 'b-release-feed', url: 'https://b.example.com/releases', maximumBytes: 80_000 }),
      source({ sourceId: 'irrelevant-standard', url: 'https://standards.example.com/spec', capability: 'unrelated-capability' }),
    ],
    history: [],
    now: NOW,
    networkAvailable: true,
    budget: { maximumJobs: 1, maximumTotalBytes: 100_000 },
  });
  assert.equal(limited.jobs.length, 1);
  assert.equal(limited.jobs[0].sourceId, 'a-release-feed');
  assert.equal(limited.deferredCount, 1);
  assert.equal(limited.jobs[0].maximumBytes, 80_000);
  assert.equal(limited.resourceBudget.maximumJobs, 1);
  assert.equal(limited.resourceBudget.maximumTotalBytes, 100_000);

  const offline = planResearchJobs({
    objectives: [objective()],
    sources: [source()],
    history: [],
    now: NOW,
    networkAvailable: false,
  });
  assert.equal(offline.status, 'offline-hold');
  assert.deepEqual(offline.jobs, []);
  assert.equal(offline.accumulatedEvidenceUsable, true);
  assert.equal(offline.creditCost, 0);
  assert.equal(offline.paidFallback, false);
});

test('research runner delegates bounded jobs to the Internet Evidence Plane and returns content-free learning', async () => {
  const calls = [];
  const evidencePlane = {
    async ingest(input) {
      calls.push(input);
      return {
        schemaVersion: 1,
        kind: 'internet-evidence-ingest-result',
        record: {
          schemaVersion: 1,
          kind: 'internet-evidence-record',
          evidenceId: `evidence-${'b'.repeat(32)}`,
          contentSha256: 'c'.repeat(64),
          duplicate: false,
        },
        memoryRecords: [{ memoryId: `mem-${'d'.repeat(32)}`, statement: 'Bounded learned fact.' }],
        zeroCredit: true,
        providerRequired: false,
        creditCost: 0,
        paidFallback: false,
      };
    },
  };
  const plan = planResearchJobs({
    objectives: [objective()],
    sources: [source()],
    history: [],
    now: NOW,
    networkAvailable: true,
  });
  const result = await runResearchJobs({ plan, evidencePlane });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].objectiveId, 'obj-research-evidence');
  assert.equal(calls[0].capability, 'research-evidence');
  assert.equal(calls[0].sourceClass, 'official-docs');
  assert.deepEqual(calls[0].priorContentHashes, []);
  assert.deepEqual(result.evidenceIds, [`evidence-${'b'.repeat(32)}`]);
  assert.deepEqual(result.memoryIds, [`mem-${'d'.repeat(32)}`]);
  assert.equal(result.completedCount, 1);
  assert.equal(result.zeroCredit, true);
  assert.equal(result.providerRequired, false);
  assert.equal(result.creditCost, 0);
  assert.equal(result.paidFallback, false);
  assert.equal(JSON.stringify(result).includes('bytes'), false);
  assert.equal(Object.isFrozen(result), true);
});
