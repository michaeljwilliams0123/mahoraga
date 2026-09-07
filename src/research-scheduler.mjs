import { createHash } from 'node:crypto';

const DEFAULT_BUDGET = Object.freeze({ maximumJobs: 8, maximumTotalBytes: 1_000_000 });
const PRIORITY_ORDER = new Map([
  ['critical', 0],
  ['high', 1],
  ['medium', 2],
  ['low', 3],
]);

export function planResearchJobs({
  objectives = [],
  sources = [],
  history = [],
  now = new Date().toISOString(),
  networkAvailable = true,
  budget = DEFAULT_BUDGET,
} = {}) {
  const observedAt = checkedTimestamp(now, 'research-now-invalid');
  if (typeof networkAvailable !== 'boolean') fail('research-network-state-invalid');
  const resourceBudget = normalizeBudget(budget);
  const normalizedObjectives = normalizeObjectives(objectives);
  const normalizedSources = normalizeSources(sources);
  const normalizedHistory = normalizeHistory(history);

  if (!networkAvailable) {
    return deepFreeze({
      schemaVersion: 1,
      kind: 'research-plan',
      status: 'offline-hold',
      jobs: [],
      deferredCount: 0,
      accumulatedEvidenceUsable: true,
      resourceBudget,
      observedAt,
      zeroCredit: true,
      providerRequired: false,
      creditCost: 0,
      paidFallback: false,
    });
  }

  const candidates = [];
  for (const objective of normalizedObjectives) {
    if (objective.state !== 'open') continue;
    for (const source of normalizedSources) {
      if (source.capability !== objective.capability) continue;
      const prior = normalizedHistory.find((entry) =>
        entry.sourceId === source.sourceId && entry.objectiveId === objective.objectiveId);
      if (prior?.bootstrapCompleted && !isDue(prior.lastFetchedAt, source.refreshMinutes, observedAt)) continue;

      const phase = prior?.bootstrapCompleted ? 'delta-refresh' : 'historical-bootstrap';
      const priorContentHashes = prior?.contentHashes ?? [];
      const core = {
        objectiveId: objective.objectiveId,
        sourceId: source.sourceId,
        url: source.url,
        capability: source.capability,
        sourceClass: source.sourceClass,
        phase,
        priorContentHashes,
        maximumBytes: source.maximumBytes,
      };
      candidates.push({
        priorityRank: PRIORITY_ORDER.get(objective.priority) ?? 99,
        value: deepFreeze({
          schemaVersion: 1,
          kind: 'research-job',
          jobId: `research-${digest(stable(core)).slice(0, 32)}`,
          ...core,
          authority: 'evidence-only',
          mutationAllowed: false,
          zeroCredit: true,
          providerRequired: false,
        }),
      });
    }
  }

  candidates.sort((left, right) =>
    left.priorityRank - right.priorityRank ||
    left.value.objectiveId.localeCompare(right.value.objectiveId) ||
    left.value.sourceId.localeCompare(right.value.sourceId));

  const jobs = [];
  let committedBytes = 0;
  let deferredCount = 0;
  for (const candidate of candidates) {
    const job = candidate.value;
    const exceedsJobs = jobs.length >= resourceBudget.maximumJobs;
    const exceedsBytes = committedBytes + job.maximumBytes > resourceBudget.maximumTotalBytes;
    if (exceedsJobs || exceedsBytes) {
      deferredCount += 1;
      continue;
    }
    jobs.push(job);
    committedBytes += job.maximumBytes;
  }

  return deepFreeze({
    schemaVersion: 1,
    kind: 'research-plan',
    status: jobs.length > 0 ? 'ready' : 'idle',
    jobs,
    deferredCount,
    accumulatedEvidenceUsable: true,
    resourceBudget,
    observedAt,
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  });
}

export async function runResearchJobs({ plan, evidencePlane, observeResult = null } = {}) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.jobs)) fail('research-plan-invalid');
  if (!evidencePlane || typeof evidencePlane.ingest !== 'function') fail('research-evidence-plane-invalid');
  if (observeResult !== null && typeof observeResult !== 'function') fail('research-result-observer-invalid');
  if (plan.zeroCredit !== true || plan.providerRequired !== false || plan.creditCost !== 0 || plan.paidFallback !== false) {
    fail('research-plan-cost-boundary-invalid');
  }

  const evidenceIds = [];
  const memoryIds = [];
  for (const job of plan.jobs) {
    const normalized = validateJob(job);
    const result = await evidencePlane.ingest({
      objectiveId: normalized.objectiveId,
      purpose: `research-${normalized.phase}`,
      url: normalized.url,
      capability: normalized.capability,
      sourceClass: normalized.sourceClass,
      priorContentHashes: [...normalized.priorContentHashes],
    });
    if (!result || result.zeroCredit !== true || result.providerRequired !== false || result.creditCost !== 0 || result.paidFallback !== false) {
      fail('research-evidence-result-invalid');
    }
    const evidenceId = result.record?.evidenceId;
    if (typeof evidenceId !== 'string' || !/^evidence-[a-f0-9]{32}$/.test(evidenceId)) fail('research-evidence-id-invalid');
    evidenceIds.push(evidenceId);
    if (!Array.isArray(result.memoryRecords)) fail('research-memory-records-invalid');
    for (const record of result.memoryRecords) {
      if (typeof record?.memoryId !== 'string' || !/^mem-[a-f0-9]{32}$/.test(record.memoryId)) fail('research-memory-id-invalid');
      memoryIds.push(record.memoryId);
    }
    if (observeResult) await observeResult(Object.freeze({ job: normalized, result }));
  }

  return deepFreeze({
    schemaVersion: 1,
    kind: 'research-run-result',
    completedCount: plan.jobs.length,
    evidenceIds: [...new Set(evidenceIds)].sort(),
    memoryIds: [...new Set(memoryIds)].sort(),
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  });
}

function normalizeObjectives(value) {
  if (!Array.isArray(value) || value.length > 1_000) fail('research-objectives-invalid');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('research-objective-invalid');
    return deepFreeze({
      objectiveId: checkedSlug(item.objectiveId, 96, 'research-objective-id-invalid'),
      capability: checkedSlug(item.capability, 64, 'research-objective-capability-invalid'),
      priority: checkedSlug(item.priority, 32, 'research-objective-priority-invalid'),
      state: checkedSlug(item.state, 32, 'research-objective-state-invalid'),
    });
  }).sort((a, b) => a.objectiveId.localeCompare(b.objectiveId));
}

function normalizeSources(value) {
  if (!Array.isArray(value) || value.length > 1_000) fail('research-sources-invalid');
  const ids = new Set();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('research-source-invalid');
    const sourceId = checkedSlug(item.sourceId, 96, 'research-source-id-invalid');
    if (ids.has(sourceId)) fail('research-source-duplicate');
    ids.add(sourceId);
    return deepFreeze({
      sourceId,
      url: normalizeUrl(item.url),
      capability: checkedSlug(item.capability, 64, 'research-source-capability-invalid'),
      sourceClass: checkedSlug(item.sourceClass, 64, 'research-source-class-invalid'),
      refreshMinutes: checkedInteger(item.refreshMinutes, 1, 43_200, 'research-refresh-invalid'),
      maximumBytes: checkedInteger(item.maximumBytes, 1, 10_000_000, 'research-source-bytes-invalid'),
    });
  }).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

function normalizeHistory(value) {
  if (!Array.isArray(value) || value.length > 10_000) fail('research-history-invalid');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('research-history-entry-invalid');
    if (typeof item.bootstrapCompleted !== 'boolean') fail('research-history-bootstrap-invalid');
    return deepFreeze({
      sourceId: checkedSlug(item.sourceId, 96, 'research-history-source-invalid'),
      objectiveId: checkedSlug(item.objectiveId, 96, 'research-history-objective-invalid'),
      bootstrapCompleted: item.bootstrapCompleted,
      lastFetchedAt: checkedTimestamp(item.lastFetchedAt, 'research-history-time-invalid'),
      contentHashes: normalizeHashes(item.contentHashes ?? []),
    });
  });
}

function normalizeBudget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('research-budget-invalid');
  return deepFreeze({
    maximumJobs: checkedInteger(value.maximumJobs ?? DEFAULT_BUDGET.maximumJobs, 1, 1_000, 'research-budget-jobs-invalid'),
    maximumTotalBytes: checkedInteger(value.maximumTotalBytes ?? DEFAULT_BUDGET.maximumTotalBytes, 1, 100_000_000, 'research-budget-bytes-invalid'),
  });
}

function validateJob(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'research-job') fail('research-job-invalid');
  if (value.authority !== 'evidence-only' || value.mutationAllowed !== false || value.zeroCredit !== true || value.providerRequired !== false) {
    fail('research-job-authority-invalid');
  }
  return value;
}

function normalizeHashes(value) {
  if (!Array.isArray(value) || value.length > 4_096 || new Set(value).size !== value.length) fail('research-history-hashes-invalid');
  return value.map((item) => {
    if (typeof item !== 'string' || !/^[a-f0-9]{64}$/i.test(item)) fail('research-history-hashes-invalid');
    return item.toLowerCase();
  }).sort();
}

function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048 || /[\0\r\n]/.test(value)) fail('research-source-url-invalid');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('research-source-url-invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('research-source-url-invalid');
  parsed.hash = '';
  return parsed.href;
}

function isDue(lastFetchedAt, refreshMinutes, now) {
  return Date.parse(now) - Date.parse(lastFetchedAt) >= refreshMinutes * 60_000;
}

function checkedTimestamp(value, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function checkedSlug(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length > maximumLength || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function checkedInteger(value, minimum, maximum, code) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
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
