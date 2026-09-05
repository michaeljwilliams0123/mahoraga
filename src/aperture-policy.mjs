import crypto from 'node:crypto';

const REQUEST_KEYS = new Set(['schemaVersion','requestId','objectiveId','requestingAgentId','capability','purpose','target','expectedPeer','protocol','ttlMs','idleTtlMs','novel','requestedAt']);
const LEASE_KEYS = new Set(['schemaVersion','leaseId','requestId','objectiveId','requestingAgentId','capability','purpose','target','expectedPeer','protocol','novel','state','issuedAt','expiresAt','idleTtlMs','validatorAgentId','validatorReason','lateralRoutingAllowed','ownerApprovalRequired']);
const DECISION_KEYS = new Set(['validatorAgentId','approved','reason']);

export function createApertureRequest(input, { requestedAt = new Date().toISOString() } = {}) {
  const ttlMs = integer(input?.ttlMs, 1_000, 86_400_000, 'aperture-ttl-invalid');
  const idleTtlMs = integer(input?.idleTtlMs, 1_000, ttlMs, 'aperture-idle-ttl-invalid');
  const core = {
    objectiveId: slug(input?.objectiveId, 'aperture-objective-invalid'),
    requestingAgentId: slug(input?.requestingAgentId, 'aperture-requester-invalid'),
    capability: slug(input?.capability, 'aperture-capability-invalid'),
    purpose: text(input?.purpose, 1000, 'aperture-purpose-invalid'),
    target: text(input?.target, 240, 'aperture-target-invalid'),
    expectedPeer: text(input?.expectedPeer, 240, 'aperture-peer-invalid'),
    protocol: slug(input?.protocol, 'aperture-protocol-invalid'),
    ttlMs,
    idleTtlMs,
    novel: boolean(input?.novel, 'aperture-novel-invalid'),
    requestedAt: timestamp(input?.requestedAt ?? requestedAt, 'aperture-request-time-invalid'),
  };
  const requestId = `aperture-request-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`;
  return validateApertureRequest({ schemaVersion: 1, requestId, ...core });
}

export function validateApertureDecision(request, decision) {
  const candidate = validateApertureRequest(request);
  exact(decision, DECISION_KEYS, 'aperture-validator-decision-invalid');
  const validatorAgentId = slug(decision.validatorAgentId, 'aperture-validator-invalid');
  if (validatorAgentId === candidate.requestingAgentId) fail('aperture-validator-independent-required');
  const approved = boolean(decision.approved, 'aperture-validator-decision-invalid');
  const reason = text(decision.reason, 1000, 'aperture-validator-reason-invalid');
  return deepFreeze({ validatorAgentId, approved, reason });
}

export function issueApertureLease(request, decision, { issuedAt = new Date().toISOString() } = {}) {
  const candidate = validateApertureRequest(request);
  const verdict = validateApertureDecision(candidate, decision);
  if (!verdict.approved) fail('aperture-validator-rejected');
  const issued = timestamp(issuedAt, 'aperture-issued-time-invalid');
  const issuedMs = Date.parse(issued);
  const expiresAt = new Date(issuedMs + candidate.ttlMs).toISOString();
  const core = {
    requestId: candidate.requestId,
    objectiveId: candidate.objectiveId,
    requestingAgentId: candidate.requestingAgentId,
    capability: candidate.capability,
    purpose: candidate.purpose,
    target: candidate.target,
    expectedPeer: candidate.expectedPeer,
    protocol: candidate.protocol,
    novel: candidate.novel,
    state: 'leased',
    issuedAt: issued,
    expiresAt,
    idleTtlMs: candidate.idleTtlMs,
    validatorAgentId: verdict.validatorAgentId,
    validatorReason: verdict.reason,
    lateralRoutingAllowed: false,
    ownerApprovalRequired: false,
  };
  const leaseId = `aperture-lease-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`;
  return validateApertureLease({ schemaVersion: 1, leaseId, ...core });
}

export function shouldCloseAperture(lease, state = {}, { now = new Date().toISOString() } = {}) {
  const current = validateApertureLease(lease);
  const nowIso = timestamp(now, 'aperture-close-time-invalid');
  const flags = [
    ['stewardSeal','steward-seal'],
    ['revoked','revoked'],
    ['integrityFailure','integrity-failure'],
    ['peerMismatch','peer-mismatch'],
    ['heartbeatLost','heartbeat-lost'],
    ['objectiveComplete','objective-complete'],
    ['postUpdateVerificationComplete','post-update-verification-complete'],
  ];
  for (const [key, reason] of flags) if (state?.[key] === true) return Object.freeze({ close: true, reason });
  const currentMs = Date.parse(nowIso);
  if (currentMs >= Date.parse(current.expiresAt)) return Object.freeze({ close: true, reason: 'lease-expired' });
  if (state.lastActivityAt !== undefined) {
    const lastActivityAt = timestamp(state.lastActivityAt, 'aperture-last-activity-invalid');
    if (currentMs - Date.parse(lastActivityAt) >= current.idleTtlMs) return Object.freeze({ close: true, reason: 'idle-expired' });
  }
  return Object.freeze({ close: false, reason: 'active' });
}

export function validateApertureRequest(value) {
  exact(value, REQUEST_KEYS, 'aperture-request-invalid');
  if (value.schemaVersion !== 1 || typeof value.requestId !== 'string' || !/^aperture-request-[a-f0-9]{24}$/.test(value.requestId)) fail('aperture-request-invalid');
  slug(value.objectiveId, 'aperture-objective-invalid');
  slug(value.requestingAgentId, 'aperture-requester-invalid');
  slug(value.capability, 'aperture-capability-invalid');
  text(value.purpose, 1000, 'aperture-purpose-invalid');
  text(value.target, 240, 'aperture-target-invalid');
  text(value.expectedPeer, 240, 'aperture-peer-invalid');
  slug(value.protocol, 'aperture-protocol-invalid');
  integer(value.ttlMs, 1_000, 86_400_000, 'aperture-ttl-invalid');
  integer(value.idleTtlMs, 1_000, value.ttlMs, 'aperture-idle-ttl-invalid');
  boolean(value.novel, 'aperture-novel-invalid');
  timestamp(value.requestedAt, 'aperture-request-time-invalid');
  return deepFreeze(structuredClone(value));
}

export function validateApertureLease(value) {
  exact(value, LEASE_KEYS, 'aperture-lease-invalid');
  if (value.schemaVersion !== 1 || typeof value.leaseId !== 'string' || !/^aperture-lease-[a-f0-9]{24}$/.test(value.leaseId)) fail('aperture-lease-invalid');
  if (typeof value.requestId !== 'string' || !/^aperture-request-[a-f0-9]{24}$/.test(value.requestId)) fail('aperture-request-invalid');
  slug(value.objectiveId, 'aperture-objective-invalid');
  slug(value.requestingAgentId, 'aperture-requester-invalid');
  slug(value.capability, 'aperture-capability-invalid');
  text(value.purpose, 1000, 'aperture-purpose-invalid');
  text(value.target, 240, 'aperture-target-invalid');
  text(value.expectedPeer, 240, 'aperture-peer-invalid');
  slug(value.protocol, 'aperture-protocol-invalid');
  boolean(value.novel, 'aperture-novel-invalid');
  if (value.state !== 'leased') fail('aperture-state-invalid');
  timestamp(value.issuedAt, 'aperture-issued-time-invalid');
  timestamp(value.expiresAt, 'aperture-expiry-time-invalid');
  integer(value.idleTtlMs, 1_000, 86_400_000, 'aperture-idle-ttl-invalid');
  slug(value.validatorAgentId, 'aperture-validator-invalid');
  if (value.validatorAgentId === value.requestingAgentId) fail('aperture-validator-independent-required');
  text(value.validatorReason, 1000, 'aperture-validator-reason-invalid');
  if (value.lateralRoutingAllowed !== false) fail('aperture-lateral-routing-forbidden');
  if (value.ownerApprovalRequired !== false) fail('aperture-owner-approval-invalid');
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) fail('aperture-expiry-time-invalid');
  return deepFreeze(structuredClone(value));
}

function integer(value,min,max,code){ if(!Number.isSafeInteger(value)||value<min||value>max) fail(code); return value; }
function boolean(value,code){ if(typeof value!=='boolean') fail(code); return value; }
function slug(value,code){ if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); return value; }
function text(value,max,code){ if(typeof value!=='string'||value.trim().length<1||value.length>max||/[\0\r\n]/.test(value)) fail(code); return value; }
function timestamp(value,code){ if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value) fail(code); return value; }
function exact(value,keys,code){ if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.size||Object.keys(value).some((key)=>!keys.has(key))) fail(code); }
function deepFreeze(value){ if(value&&typeof value==='object'&&!Object.isFrozen(value)){ Object.freeze(value); for(const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code){ const error=new TypeError(code); error.code=code; throw error; }
