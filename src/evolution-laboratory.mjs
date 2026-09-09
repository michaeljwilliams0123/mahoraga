import { createHash } from 'node:crypto';

export const EVOLUTION_LAB_SCHEMA_VERSION = 1;
const VERIFICATION = new Set(['exact-head', 'contract-suite', 'interactive-test', 'manual-gate']);

export function createEvolutionExperiment(input, { now = () => new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof now !== 'function') fail('evolution-experiment-invalid');
  const experiment = {
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    experimentId: slug(input.experimentId, 'evolution-experiment-id-invalid'),
    objectiveId: slug(input.objectiveId, 'evolution-objective-id-invalid'),
    hypothesis: text(input.hypothesis, 2000, 'evolution-hypothesis-invalid'),
    baselineMetric: metric(input.baselineMetric),
    candidateMetric: metric(input.candidateMetric),
    verification: verification(input.verification),
    isolated: input.isolated === true,
    state: 'evaluated',
    observedAt: canonical(now()),
    zeroCredit: true,
    providerRequired: false,
  };
  if (!experiment.isolated) fail('evolution-isolation-required');
  return deepFreeze({ ...experiment, fingerprint: digest(experiment) });
}

export function evaluateEvolutionExperiment(value, { verified = false } = {}) {
  const experiment = validate(value);
  const delta = experiment.candidateMetric - experiment.baselineMetric;
  let decision = 'hold';
  let negativeResult = false;
  let productionEligible = false;
  if (delta <= 0) {
    decision = 'reject';
    negativeResult = true;
  } else if (verified === true) {
    decision = 'graduate';
    productionEligible = true;
  }
  const result = {
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    experimentId: experiment.experimentId,
    objectiveId: experiment.objectiveId,
    decision,
    metricDelta: Number(delta.toFixed(12)),
    negativeResult,
    productionEligible,
    verificationSatisfied: verified === true,
    verification: experiment.verification,
    zeroCredit: true,
    providerRequired: false,
  };
  return deepFreeze({ ...result, fingerprint: digest(result) });
}

export function validateEvolutionExperiment(value) { return validate(value); }

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('evolution-experiment-invalid');
  if (value.schemaVersion !== EVOLUTION_LAB_SCHEMA_VERSION || value.state !== 'evaluated') fail('evolution-experiment-invalid');
  const core = {
    schemaVersion: EVOLUTION_LAB_SCHEMA_VERSION,
    experimentId: slug(value.experimentId, 'evolution-experiment-id-invalid'),
    objectiveId: slug(value.objectiveId, 'evolution-objective-id-invalid'),
    hypothesis: text(value.hypothesis, 2000, 'evolution-hypothesis-invalid'),
    baselineMetric: metric(value.baselineMetric),
    candidateMetric: metric(value.candidateMetric),
    verification: verification(value.verification),
    isolated: value.isolated === true,
    state: 'evaluated',
    observedAt: canonical(value.observedAt),
    zeroCredit: value.zeroCredit === true,
    providerRequired: value.providerRequired === false,
  };
  if (!core.isolated || !core.zeroCredit || !core.providerRequired) fail('evolution-boundary-invalid');
  const expected = digest(core);
  if (value.fingerprint !== expected) fail('evolution-fingerprint-invalid');
  return deepFreeze({ ...core, fingerprint: expected });
}

function verification(value) { if (!VERIFICATION.has(value)) fail('evolution-verification-invalid'); return value; }
function metric(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('evolution-metric-invalid'); return value; }
function slug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code); return value; }
function text(value, max, code) { if (typeof value !== 'string') fail(code); const out=value.replace(/\s+/g,' ').trim(); if (!out || out.length>max || /\0/.test(value)) fail(code); return out; }
function canonical(value) { const d=value instanceof Date?value:new Date(value); if (!Number.isFinite(d.getTime())) fail('evolution-clock-invalid'); const out=d.toISOString(); if (typeof value==='string' && value!==out) fail('evolution-clock-invalid'); return out; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error=new TypeError(code); error.code=code; throw error; }
