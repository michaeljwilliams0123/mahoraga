import crypto from 'node:crypto';

const ROUTINE_KEYS = new Set(['schemaVersion','routineId','parentRoutineId','agentId','capability','intent','version','parameters','surfaces','steps','successEvidence','confidence','successes','failures','learnedAt','corrections']);
const PARAMETER_KEYS = new Set(['name','secret']);
const STEP_KEYS = new Set(['action','evidence','sideEffect']);
const CORRECTION_KEYS = new Set(['reason','fromRoutineId','correctedAt']);

export function compileRoutineDemonstration(input, { learnedAt = new Date().toISOString(), confidence = 0.5, successes = 0, failures = 0 } = {}) {
  const core = {
    parentRoutineId: null,
    agentId: slug(input?.agentId, 'routine-agent-id-invalid'),
    capability: slug(input?.capability, 'routine-capability-invalid'),
    intent: text(input?.intent, 1200, 'routine-intent-invalid'),
    version: 1,
    parameters: parameters(input?.parameters ?? []),
    surfaces: slugList(input?.surfaces ?? [], 16, 'routine-surfaces-invalid', true),
    steps: steps(input?.steps),
    successEvidence: textList(input?.successEvidence, 32, 240, 'routine-success-evidence-invalid', true),
    confidence: probability(confidence, 'routine-confidence-invalid'),
    successes: count(successes, 'routine-success-count-invalid'),
    failures: count(failures, 'routine-failure-count-invalid'),
    learnedAt: timestamp(learnedAt, 'routine-learned-at-invalid'),
    corrections: [],
  };
  const routineId = idFor(core);
  return validateRoutine({ schemaVersion: 1, routineId, ...core });
}

export function correctRoutine(routine, correction, { learnedAt = new Date().toISOString() } = {}) {
  const current = validateRoutine(routine);
  if (!correction || typeof correction !== 'object' || Array.isArray(correction)) fail('routine-correction-invalid');
  const correctedAt = timestamp(learnedAt, 'routine-correction-time-invalid');
  const nextSteps = steps(correction.steps);
  const history = [...current.corrections, deepFreeze({
    reason: text(correction.reason, 1000, 'routine-correction-reason-invalid'),
    fromRoutineId: current.routineId,
    correctedAt,
  })];
  const core = {
    parentRoutineId: current.routineId,
    agentId: current.agentId,
    capability: current.capability,
    intent: current.intent,
    version: current.version + 1,
    parameters: current.parameters,
    surfaces: current.surfaces,
    steps: nextSteps,
    successEvidence: current.successEvidence,
    confidence: Math.min(current.confidence, 0.75),
    successes: 0,
    failures: 0,
    learnedAt: correctedAt,
    corrections: history,
  };
  return validateRoutine({ schemaVersion: 1, routineId: idFor(core), ...core });
}

export function rankRoutines(routines, context = {}) {
  if (!Array.isArray(routines) || routines.length > 10_000) fail('routine-list-invalid');
  const capability = context.capability === undefined ? null : slug(context.capability, 'routine-context-capability-invalid');
  const surface = context.surface === undefined ? null : slug(context.surface, 'routine-context-surface-invalid');
  const ranked = routines.map(validateRoutine).filter((routine) => (!capability || routine.capability === capability) && (!surface || routine.surfaces.includes(surface)));
  ranked.sort((a, b) => score(b) - score(a) || b.learnedAt.localeCompare(a.learnedAt) || a.routineId.localeCompare(b.routineId));
  return deepFreeze(ranked);
}

export function verifyRoutineReplay(routine, replay = {}) {
  const current = validateRoutine(routine);
  const evidence = new Set(textList(replay.evidence ?? [], 128, 240, 'routine-replay-evidence-invalid', false));
  if (current.successEvidence.some((item) => !evidence.has(item))) return Object.freeze({ verified: false, reason: 'success-evidence-missing' });
  return Object.freeze({ verified: true, reason: 'verified' });
}

export function validateRoutine(value) {
  exact(value, ROUTINE_KEYS, 'routine-invalid');
  if (value.schemaVersion !== 1) fail('routine-schema-invalid');
  if (typeof value.routineId !== 'string' || !/^routine-[a-f0-9]{24}$/.test(value.routineId)) fail('routine-id-invalid');
  if (value.parentRoutineId !== null && (typeof value.parentRoutineId !== 'string' || !/^routine-[a-f0-9]{24}$/.test(value.parentRoutineId))) fail('routine-parent-id-invalid');
  slug(value.agentId, 'routine-agent-id-invalid');
  slug(value.capability, 'routine-capability-invalid');
  text(value.intent, 1200, 'routine-intent-invalid');
  if (!Number.isSafeInteger(value.version) || value.version < 1 || value.version > 1_000_000) fail('routine-version-invalid');
  parameters(value.parameters);
  slugList(value.surfaces, 16, 'routine-surfaces-invalid', true);
  steps(value.steps);
  textList(value.successEvidence, 32, 240, 'routine-success-evidence-invalid', true);
  probability(value.confidence, 'routine-confidence-invalid');
  count(value.successes, 'routine-success-count-invalid');
  count(value.failures, 'routine-failure-count-invalid');
  timestamp(value.learnedAt, 'routine-learned-at-invalid');
  corrections(value.corrections);
  return deepFreeze(structuredClone(value));
}

function parameters(value) {
  if (!Array.isArray(value) || value.length > 32) fail('routine-parameter-invalid');
  const names = new Set();
  return value.map((item) => {
    exact(item, PARAMETER_KEYS, 'routine-parameter-invalid');
    const name = slug(item.name, 'routine-parameter-invalid');
    if (names.has(name) || typeof item.secret !== 'boolean') fail('routine-parameter-invalid');
    names.add(name);
    return deepFreeze({ name, secret: item.secret });
  });
}
function steps(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) fail('routine-steps-invalid');
  return value.map((item) => {
    exact(item, STEP_KEYS, 'routine-step-invalid');
    return deepFreeze({ action: slug(item.action, 'routine-step-action-invalid'), evidence: textList(item.evidence, 16, 240, 'routine-step-evidence-invalid', true), sideEffect: slug(item.sideEffect, 'routine-step-side-effect-invalid') });
  });
}
function corrections(value) {
  if (!Array.isArray(value) || value.length > 256) fail('routine-corrections-invalid');
  return value.map((item) => {
    exact(item, CORRECTION_KEYS, 'routine-correction-invalid');
    text(item.reason, 1000, 'routine-correction-reason-invalid');
    if (typeof item.fromRoutineId !== 'string' || !/^routine-[a-f0-9]{24}$/.test(item.fromRoutineId)) fail('routine-correction-source-invalid');
    timestamp(item.correctedAt, 'routine-correction-time-invalid');
    return deepFreeze(structuredClone(item));
  });
}
function idFor(core) { return `routine-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`; }
function score(routine) { return routine.confidence * 100 + Math.min(routine.successes, 100) * 2 - Math.min(routine.failures, 100) * 8; }
function probability(value, code) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail(code); return value; }
function count(value, code) { if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(code); return value; }
function slug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); return value; }
function slugList(value, max, code, requireOne) { if (!Array.isArray(value) || value.length > max || (requireOne && value.length < 1) || new Set(value).size !== value.length) fail(code); return value.map((item) => slug(item, code)); }
function text(value, max, code) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(code); return value; }
function textList(value, maxItems, maxLength, code, requireOne) { if (!Array.isArray(value) || value.length > maxItems || (requireOne && value.length < 1) || new Set(value).size !== value.length) fail(code); return value.map((item) => text(item, maxLength, code)); }
function timestamp(value, code) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
