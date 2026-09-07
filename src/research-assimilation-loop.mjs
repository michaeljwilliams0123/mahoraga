import { reconcileInstitutionalMemory } from './institutional-memory.mjs';
import { planResearchJobs, runResearchJobs } from './research-scheduler.mjs';

const MAX_HISTORY = 10_000;
const MAX_CONTENT_HASHES = 4_096;

export async function runResearchAssimilation({
  objectives = [],
  sources = [],
  history = [],
  existingMemoryRecords = [],
  now = new Date().toISOString(),
  networkAvailable = true,
  budget = undefined,
  evidencePlane = null,
} = {}) {
  const observedAt = canonicalTimestamp(now, 'research-assimilation-now-invalid');
  const normalizedHistory = normalizeHistory(history);
  if (!Array.isArray(existingMemoryRecords) || existingMemoryRecords.length > 20_000) {
    fail('research-assimilation-memory-invalid');
  }

  const planInput = {
    objectives,
    sources,
    history: normalizedHistory,
    now: observedAt,
    networkAvailable,
  };
  if (budget !== undefined) planInput.budget = budget;
  const plan = planResearchJobs(planInput);
  assertZeroCredit(plan, 'research-assimilation-plan-contaminated');

  const captured = [];
  let run;
  if (plan.jobs.length === 0) {
    run = deepFreeze({
      schemaVersion: 1,
      kind: 'research-run-result',
      completedCount: 0,
      evidenceIds: [],
      memoryIds: [],
      zeroCredit: true,
      providerRequired: false,
      creditCost: 0,
      paidFallback: false,
    });
  } else {
    if (!evidencePlane || typeof evidencePlane.ingest !== 'function') fail('research-assimilation-evidence-plane-invalid');
    run = await runResearchJobs({
      plan,
      evidencePlane,
      observeResult: ({ job, result }) => {
        captured.push(captureResult(job, result));
      },
    });
  }
  assertZeroCredit(run, 'research-assimilation-run-contaminated');

  const incomingMemory = captured.flatMap((item) => item.memoryRecords);
  const memory = reconcileInstitutionalMemory({
    records: existingMemoryRecords,
    incoming: incomingMemory,
    now: observedAt,
  });
  const nextHistory = advanceHistory(normalizedHistory, captured);
  const evidenceIds = [...new Set(captured.map((item) => item.evidenceId))].sort();
  const newMemoryIds = [...new Set(incomingMemory.map((record) => record.memoryId))].sort();

  return deepFreeze({
    schemaVersion: 1,
    kind: 'research-assimilation',
    observedAt,
    plan,
    run,
    history: nextHistory,
    memory,
    evidenceIds,
    newMemoryIds,
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  });
}

function captureResult(job, result) {
  if (!job || typeof job !== 'object' || job.kind !== 'research-job') fail('research-assimilation-job-invalid');
  assertZeroCredit(result, 'research-assimilation-evidence-contaminated');
  const evidenceId = String(result?.record?.evidenceId ?? '');
  const contentSha256 = String(result?.record?.contentSha256 ?? '').toLowerCase();
  const fetchedAt = canonicalTimestamp(result?.record?.observedAt, 'research-assimilation-observed-at-invalid');
  if (!/^evidence-[a-f0-9]{32}$/.test(evidenceId)) fail('research-assimilation-evidence-id-invalid');
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) fail('research-assimilation-content-hash-invalid');
  if (!Array.isArray(result.memoryRecords) || result.memoryRecords.length > 64) fail('research-assimilation-memory-invalid');
  return deepFreeze({
    sourceId: checkedSlug(job.sourceId, 96, 'research-assimilation-source-invalid'),
    objectiveId: checkedSlug(job.objectiveId, 96, 'research-assimilation-objective-invalid'),
    evidenceId,
    contentSha256,
    fetchedAt,
    memoryRecords: [...result.memoryRecords],
  });
}

function advanceHistory(history, captured) {
  const byKey = new Map(history.map((entry) => [historyKey(entry), entry]));
  for (const item of captured) {
    const key = `${item.sourceId}\u0000${item.objectiveId}`;
    const prior = byKey.get(key);
    const hashes = new Set(prior?.contentHashes ?? []);
    hashes.add(item.contentSha256);
    if (hashes.size > MAX_CONTENT_HASHES) fail('research-assimilation-history-hashes-invalid');
    byKey.set(key, deepFreeze({
      sourceId: item.sourceId,
      objectiveId: item.objectiveId,
      bootstrapCompleted: true,
      lastFetchedAt: item.fetchedAt,
      contentHashes: [...hashes].sort(),
    }));
  }
  return deepFreeze([...byKey.values()].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId) || a.objectiveId.localeCompare(b.objectiveId)));
}

function normalizeHistory(value) {
  if (!Array.isArray(value) || value.length > MAX_HISTORY) fail('research-assimilation-history-invalid');
  const keys = new Set();
  const normalized = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('research-assimilation-history-entry-invalid');
    if (typeof item.bootstrapCompleted !== 'boolean') fail('research-assimilation-history-bootstrap-invalid');
    const entry = deepFreeze({
      sourceId: checkedSlug(item.sourceId, 96, 'research-assimilation-source-invalid'),
      objectiveId: checkedSlug(item.objectiveId, 96, 'research-assimilation-objective-invalid'),
      bootstrapCompleted: item.bootstrapCompleted,
      lastFetchedAt: canonicalTimestamp(item.lastFetchedAt, 'research-assimilation-history-time-invalid'),
      contentHashes: normalizeHashes(item.contentHashes ?? []),
    });
    const key = historyKey(entry);
    if (keys.has(key)) fail('research-assimilation-history-duplicate');
    keys.add(key);
    return entry;
  });
  return deepFreeze(normalized.sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId) || a.objectiveId.localeCompare(b.objectiveId)));
}

function historyKey(entry) {
  return `${entry.sourceId}\u0000${entry.objectiveId}`;
}

function normalizeHashes(value) {
  if (!Array.isArray(value) || value.length > MAX_CONTENT_HASHES || new Set(value).size !== value.length) {
    fail('research-assimilation-history-hashes-invalid');
  }
  return deepFreeze(value.map((item) => {
    if (typeof item !== 'string' || !/^[a-f0-9]{64}$/i.test(item)) fail('research-assimilation-history-hashes-invalid');
    return item.toLowerCase();
  }).sort());
}

function assertZeroCredit(value, code) {
  if (!value || value.zeroCredit !== true || value.providerRequired !== false || value.creditCost !== 0 || value.paidFallback !== false) fail(code);
}

function checkedSlug(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length > maximumLength || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function canonicalTimestamp(value, code) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) fail(code);
  return text;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
