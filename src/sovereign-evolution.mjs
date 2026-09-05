import crypto from 'node:crypto';

const EPOCH_KEYS = new Set(['schemaVersion','epochId','trustedCommit','verifierFingerprint','rollbackCheckpointId','policyGeneration','activatedAt']);
const RECEIPT_KEYS = new Set(['schemaVersion','receiptId','trustedEpoch','candidateCommit','candidateEpochId','validatorAgentId','validatorPassed','deterministicVerificationPassed','rollbackCheckpointCreated','rollbackRehearsalPassed','canaryPassed','stateCompatibilityPassed','sovereigntyInvariantPassed','evaluatedAt']);
const PROOFS = Object.freeze([
  ['validatorPassed','sovereign-validator-passed-required'],
  ['deterministicVerificationPassed','sovereign-deterministic-verification-passed-required'],
  ['rollbackCheckpointCreated','sovereign-rollback-checkpoint-created-required'],
  ['rollbackRehearsalPassed','sovereign-rollback-rehearsal-passed-required'],
  ['canaryPassed','sovereign-canary-passed-required'],
  ['stateCompatibilityPassed','sovereign-state-compatibility-passed-required'],
  ['sovereigntyInvariantPassed','sovereign-sovereignty-invariant-passed-required'],
]);

export function createTrustEpoch(input, { activatedAt = new Date().toISOString() } = {}) {
  return validateTrustEpoch({
    schemaVersion: 1,
    epochId: epochId(input?.epochId, 'sovereign-epoch-id-invalid'),
    trustedCommit: commit(input?.trustedCommit, 'sovereign-trusted-commit-invalid'),
    verifierFingerprint: fingerprint(input?.verifierFingerprint, 'sovereign-verifier-fingerprint-invalid'),
    rollbackCheckpointId: slug(input?.rollbackCheckpointId, 'sovereign-rollback-checkpoint-invalid'),
    policyGeneration: integer(input?.policyGeneration, 1, 1_000_000, 'sovereign-policy-generation-invalid'),
    activatedAt: timestamp(input?.activatedAt ?? activatedAt, 'sovereign-epoch-time-invalid'),
  });
}

export function createSovereignEvolutionReceipt(input, { evaluatedAt = new Date().toISOString() } = {}) {
  const trustedEpoch = validateTrustEpoch(input?.trustedEpoch);
  const candidateEpochId = epochId(input?.candidateEpochId, 'sovereign-candidate-epoch-invalid');
  const candidateCommit = commit(input?.candidateCommit, 'sovereign-candidate-commit-invalid');
  if (candidateEpochId === trustedEpoch.epochId || candidateCommit === trustedEpoch.trustedCommit) fail('sovereign-candidate-epoch-invalid');
  const core = {
    trustedEpoch,
    candidateCommit,
    candidateEpochId,
    validatorAgentId: slug(input?.validatorAgentId, 'sovereign-validator-agent-invalid'),
  };
  for (const [field, code] of PROOFS) {
    if (input?.[field] !== true) fail(code);
    core[field] = true;
  }
  core.evaluatedAt = timestamp(input?.evaluatedAt ?? evaluatedAt, 'sovereign-evaluated-time-invalid');
  const receiptId = `sovereign-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`;
  return validateReceiptShape({ schemaVersion: 1, receiptId, ...core });
}

export function validateSovereignEvolutionReceipt(receipt, context = {}) {
  let current;
  try { current = validateReceiptShape(receipt); }
  catch (error) { return Object.freeze({ valid: false, reason: error?.code ?? 'sovereign-receipt-invalid' }); }
  if (commit(context.headSha, 'sovereign-head-invalid') !== current.candidateCommit) return Object.freeze({ valid: false, reason: 'sovereign-head-mismatch' });
  if (epochId(context.trustedEpochId, 'sovereign-trusted-epoch-invalid') !== current.trustedEpoch.epochId) return Object.freeze({ valid: false, reason: 'sovereign-trusted-epoch-mismatch' });
  return Object.freeze({ valid: true, reason: 'sovereign-valid' });
}

export function validateTrustEpoch(value) {
  exact(value, EPOCH_KEYS, 'sovereign-trust-epoch-invalid');
  if (value.schemaVersion !== 1) fail('sovereign-trust-epoch-invalid');
  epochId(value.epochId, 'sovereign-epoch-id-invalid');
  commit(value.trustedCommit, 'sovereign-trusted-commit-invalid');
  fingerprint(value.verifierFingerprint, 'sovereign-verifier-fingerprint-invalid');
  slug(value.rollbackCheckpointId, 'sovereign-rollback-checkpoint-invalid');
  integer(value.policyGeneration, 1, 1_000_000, 'sovereign-policy-generation-invalid');
  timestamp(value.activatedAt, 'sovereign-epoch-time-invalid');
  return deepFreeze(structuredClone(value));
}

function validateReceiptShape(value) {
  exact(value, RECEIPT_KEYS, 'sovereign-receipt-invalid');
  if (value.schemaVersion !== 1 || typeof value.receiptId !== 'string' || !/^sovereign-[a-f0-9]{24}$/.test(value.receiptId)) fail('sovereign-receipt-invalid');
  const trustedEpoch = validateTrustEpoch(value.trustedEpoch);
  const candidateCommit = commit(value.candidateCommit, 'sovereign-candidate-commit-invalid');
  const candidateEpochId = epochId(value.candidateEpochId, 'sovereign-candidate-epoch-invalid');
  if (candidateEpochId === trustedEpoch.epochId || candidateCommit === trustedEpoch.trustedCommit) fail('sovereign-candidate-epoch-invalid');
  slug(value.validatorAgentId, 'sovereign-validator-agent-invalid');
  for (const [field, code] of PROOFS) if (value[field] !== true) fail(code);
  timestamp(value.evaluatedAt, 'sovereign-evaluated-time-invalid');
  const core = structuredClone(value);
  delete core.schemaVersion;
  delete core.receiptId;
  const expected = `sovereign-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`;
  if (value.receiptId !== expected) fail('sovereign-receipt-id-invalid');
  return deepFreeze(structuredClone(value));
}

function epochId(value,code){ if(typeof value!=='string'||!/^epoch-[1-9][0-9]{0,11}$/.test(value)) fail(code); return value; }
function commit(value,code){ if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value)) fail(code); return value; }
function fingerprint(value,code){ if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) fail(code); return value; }
function slug(value,code){ if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); return value; }
function integer(value,min,max,code){ if(!Number.isSafeInteger(value)||value<min||value>max) fail(code); return value; }
function timestamp(value,code){ if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value) fail(code); return value; }
function exact(value,keys,code){ if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.size||Object.keys(value).some((key)=>!keys.has(key))) fail(code); }
function deepFreeze(value){ if(value&&typeof value==='object'&&!Object.isFrozen(value)){ Object.freeze(value); for(const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code){ const error=new TypeError(code); error.code=code; throw error; }
