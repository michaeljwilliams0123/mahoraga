import { createHash } from 'node:crypto';

export const EVOLUTION_LAB_SCHEMA_VERSION = 2;

const VERIFICATIONS = new Set(['exact-head', 'contract-suite', 'interactive-test', 'manual-gate']);
const CREATE_KEYS = new Set([
  'experimentId', 'objectiveId', 'hypothesis', 'baselineMetric',
  'candidateMetric', 'verification', 'isolated',
]);
const EXPERIMENT_KEYS = new Set([
  'schemaVersion', 'kind', 'experimentId', 'objectiveId', 'hypothesis',
  'baselineMetric', 'candidateMetric', 'verification', 'isolated',
  'observedAt', 'zeroCredit', 'providerRequired', 'fingerprint',
]);

export function createEvolutionExperiment(input, { observedAt = new Date().toISOString() } = {}) {
  exact(input, CREATE_KEYS, 'evolution-experiment-invalid');
  const core = experimentCore({
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    kind: 'evolution-experiment',
    experimentId: input.experimentId,
    objectiveId: input.objectiveId,
    hypothesis: input.hypothesis,
    baselineMetric: input.baselineMetric,
    candidateMetric: input.candidateMetric,
    verification: input.verification,
    isolated: input.isolated,
    observedAt,
    zeroCredit: true,
    providerRequired: false,
  });
  return deepFreeze({ ...core, fingerprint: digest(core) });
}
export function validateEvolutionExperiment(value) {
  exact(value, EXPERIMENT_KEYS, 'evolution-experiment-invalid');
  const core = experimentCore(value);
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) {
    fail('evolution-fingerprint-invalid');
  }
  const expected = digest(core);
  if (value.fingerprint !== expected) fail('evolution-fingerprint-invalid');
  return deepFreeze({ ...core, fingerprint: expected });
}

export function evaluateEvolutionExperiment(value, { verificationSatisfied = false } = {}) {
  const experiment = validateEvolutionExperiment(value);
  if (typeof verificationSatisfied !== 'boolean') fail('evolution-verification-state-invalid');
  const metricDelta = Number((experiment.candidateMetric - experiment.baselineMetric).toFixed(12));
  const negativeResult = metricDelta <= 0;
  const controllerEligible = metricDelta > 0 && verificationSatisfied === true;
  const decision = negativeResult ? 'reject' : controllerEligible ? 'graduation-ready' : 'hold';
  const core = {
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    kind: 'evolution-experiment-evaluation',
    experimentId: experiment.experimentId,
    objectiveId: experiment.objectiveId,
    decision,
    metricDelta,
    negativeResult,
    verificationSatisfied,
    verification: experiment.verification,
    controllerEligible,
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}
function experimentCore(value) {
  if (value.schemaVersion !== EVOLUTION_LAB_SCHEMA_VERSION || value.kind !== 'evolution-experiment') {
    fail('evolution-experiment-invalid');
  }
  if (value.isolated !== true) fail('evolution-isolation-required');
  if (value.zeroCredit !== true || value.providerRequired !== false) fail('evolution-boundary-invalid');
  return {
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    kind: 'evolution-experiment',
    experimentId: slug(value.experimentId, 'evolution-experiment-id-invalid'),
    objectiveId: slug(value.objectiveId, 'evolution-objective-id-invalid'),
    hypothesis: text(value.hypothesis, 2_000, 'evolution-hypothesis-invalid'),
    baselineMetric: metric(value.baselineMetric),
    candidateMetric: metric(value.candidateMetric),
    verification: verification(value.verification),
    isolated: true,
    observedAt: timestamp(value.observedAt, 'evolution-clock-invalid'),
    zeroCredit: true,
    providerRequired: false,
  };
}

function verification(value) {
  if (!VERIFICATIONS.has(value)) fail('evolution-verification-invalid');
  return value;
}

function metric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('evolution-metric-invalid');
  return value;
}

function slug(value, code) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code);
  return value;
}
function text(value, maximum, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}

function timestamp(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(code);
  const canonical = date.toISOString();
  if (typeof value === 'string' && value !== canonical) fail(code);
  return canonical;
}

function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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