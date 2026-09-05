import crypto from 'node:crypto';

const LIFECYCLES = new Set(['idle','working','waiting','blocked','draining','sealed']);
const OUTCOMES = new Set(['success','failure','blocked']);
const URGENCIES = new Set(['low','normal','high','critical']);
const STATE_KEYS = new Set(['schemaVersion','agentId','lifecycle','objectiveIds','routineIds','reusableFeatIds','inbox','scorecard','lastHeartbeatAt','lastSuccessfulActivityAt']);
const HANDOFF_KEYS = new Set(['schemaVersion','handoffId','fromAgentId','toAgentId','objectiveId','capability','task','inputs','expectedOutputs','urgency','mayDelegate','createdAt']);
const SCORE_KEYS = new Set(['successes','failures','blocked','handoffsReceived']);

export function createCoworkerState(input, { at = new Date().toISOString() } = {}) {
  const now = timestamp(at, 'coworker-time-invalid');
  return validateCoworkerState({
    schemaVersion: 1,
    agentId: slug(input?.agentId, 'coworker-agent-id-invalid'),
    lifecycle: 'idle',
    objectiveIds: [], routineIds: [], reusableFeatIds: [], inbox: [],
    scorecard: { successes: 0, failures: 0, blocked: 0, handoffsReceived: 0 },
    lastHeartbeatAt: now,
    lastSuccessfulActivityAt: null,
  });
}

export function createHandoffEnvelope(input, { createdAt = new Date().toISOString() } = {}) {
  const core = handoffCore(input);
  const handoffId = handoffIdFor(core);
  return validateHandoffEnvelope({ schemaVersion: 1, handoffId, ...core, createdAt: timestamp(createdAt, 'coworker-handoff-time-invalid') });
}

export function enqueueHandoff(state, envelope) {
  const current = validateCoworkerState(state);
  const handoff = validateHandoffEnvelope(envelope);
  if (handoff.toAgentId !== current.agentId) fail('coworker-handoff-recipient-mismatch');
  if (current.inbox.some((item) => item.handoffId === handoff.handoffId)) return current;
  if (current.inbox.length >= 512) fail('coworker-inbox-full');
  return validateCoworkerState({
    ...structuredClone(current),
    inbox: [...current.inbox, handoff],
    scorecard: { ...current.scorecard, handoffsReceived: current.scorecard.handoffsReceived + 1 },
  });
}

export function recordCoworkerOutcome(state, outcome, { at = new Date().toISOString() } = {}) {
  const current = validateCoworkerState(state);
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome) || !OUTCOMES.has(outcome.outcome)) fail('coworker-outcome-invalid');
  const now = timestamp(at, 'coworker-time-invalid');
  const objectiveId = slug(outcome.objectiveId, 'coworker-outcome-objective-invalid');
  const feats = featIds(outcome.reusableFeatIds ?? []);
  const scorecard = { ...current.scorecard };
  if (outcome.outcome === 'success') scorecard.successes += 1;
  if (outcome.outcome === 'failure') scorecard.failures += 1;
  if (outcome.outcome === 'blocked') scorecard.blocked += 1;
  const objectiveIds = [...new Set([...current.objectiveIds, objectiveId])].sort();
  const reusableFeatIds = outcome.outcome === 'success'
    ? [...new Set([...current.reusableFeatIds, ...feats])].sort()
    : [...current.reusableFeatIds];
  return validateCoworkerState({
    ...structuredClone(current),
    lifecycle: outcome.outcome === 'blocked' ? 'blocked' : 'idle',
    objectiveIds,
    reusableFeatIds,
    scorecard,
    lastHeartbeatAt: now,
    lastSuccessfulActivityAt: outcome.outcome === 'success' ? now : current.lastSuccessfulActivityAt,
  });
}

export function validateCoworkerState(value) {
  exact(value, STATE_KEYS, 'coworker-state-invalid');
  if (value.schemaVersion !== 1) fail('coworker-schema-invalid');
  slug(value.agentId, 'coworker-agent-id-invalid');
  if (!LIFECYCLES.has(value.lifecycle)) fail('coworker-lifecycle-invalid');
  slugList(value.objectiveIds, 512, 'coworker-objectives-invalid');
  idList(value.routineIds, /^routine-[a-f0-9]{24}$/, 512, 'coworker-routines-invalid');
  featIds(value.reusableFeatIds);
  if (!Array.isArray(value.inbox) || value.inbox.length > 512) fail('coworker-inbox-invalid');
  const seen = new Set();
  for (const raw of value.inbox) {
    const item = validateHandoffEnvelope(raw);
    if (item.toAgentId !== value.agentId || seen.has(item.handoffId)) fail('coworker-inbox-invalid');
    seen.add(item.handoffId);
  }
  exact(value.scorecard, SCORE_KEYS, 'coworker-scorecard-invalid');
  for (const item of Object.values(value.scorecard)) count(item, 'coworker-scorecard-invalid');
  timestamp(value.lastHeartbeatAt, 'coworker-heartbeat-invalid');
  if (value.lastSuccessfulActivityAt !== null) timestamp(value.lastSuccessfulActivityAt, 'coworker-success-time-invalid');
  return deepFreeze(structuredClone(value));
}

export function validateHandoffEnvelope(value) {
  exact(value, HANDOFF_KEYS, 'coworker-handoff-invalid');
  if (value.schemaVersion !== 1 || typeof value.handoffId !== 'string' || !/^handoff-[a-f0-9]{24}$/.test(value.handoffId)) fail('coworker-handoff-invalid');
  const core = handoffCore(value);
  if (value.handoffId !== handoffIdFor(core)) fail('coworker-handoff-id-invalid');
  timestamp(value.createdAt, 'coworker-handoff-time-invalid');
  return deepFreeze(structuredClone(value));
}

function handoffCore(value) {
  return {
    fromAgentId: slug(value?.fromAgentId, 'coworker-handoff-sender-invalid'),
    toAgentId: slug(value?.toAgentId, 'coworker-handoff-recipient-invalid'),
    objectiveId: slug(value?.objectiveId, 'coworker-handoff-objective-invalid'),
    capability: slug(value?.capability, 'coworker-handoff-capability-invalid'),
    task: text(value?.task, 2000, 'coworker-handoff-task-invalid'),
    inputs: textList(value?.inputs ?? [], 64, 400, 'coworker-handoff-inputs-invalid'),
    expectedOutputs: textList(value?.expectedOutputs, 64, 400, 'coworker-handoff-outputs-invalid', true),
    urgency: urgency(value?.urgency),
    mayDelegate: boolean(value?.mayDelegate, 'coworker-handoff-delegation-invalid'),
  };
}
function handoffIdFor(core) { return `handoff-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`; }
function featIds(value) { return idList(value, /^feat-[a-f0-9]{24}$/, 10_000, 'coworker-feats-invalid'); }
function idList(value, pattern, max, code) { if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length || value.some((item)=>typeof item !== 'string' || !pattern.test(item))) fail(code); return [...value].sort(); }
function slugList(value,max,code){ if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length) fail(code); return value.map((item)=>slug(item,code)).sort(); }
function urgency(value){ if(!URGENCIES.has(value)) fail('coworker-handoff-urgency-invalid'); return value; }
function boolean(value,code){ if(typeof value !== 'boolean') fail(code); return value; }
function count(value,code){ if(!Number.isSafeInteger(value)||value<0||value>1_000_000) fail(code); return value; }
function slug(value,code){ if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); return value; }
function text(value,max,code){ if(typeof value!=='string'||value.trim().length<1||value.length>max||/[\0]/.test(value)) fail(code); return value; }
function textList(value,maxItems,maxLength,code,requireOne=false){ if(!Array.isArray(value)||value.length>maxItems||(requireOne&&value.length<1)||new Set(value).size!==value.length) fail(code); return value.map((item)=>text(item,maxLength,code)); }
function timestamp(value,code){ if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value) fail(code); return value; }
function exact(value,keys,code){ if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.size||Object.keys(value).some((key)=>!keys.has(key))) fail(code); }
function deepFreeze(value){ if(value&&typeof value==='object'&&!Object.isFrozen(value)){ Object.freeze(value); for(const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code){ const error=new TypeError(code); error.code=code; throw error; }
