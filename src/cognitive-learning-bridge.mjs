import { createInstitutionalMemoryRecord } from './institutional-memory.mjs';

export function promoteVerifiedCognitiveLearning({ cycle, verification, observedAt = new Date().toISOString() } = {}) {
  assertCycle(cycle);
  assertVerification(verification);
  if (verification.sourceFingerprint !== cycle.fingerprint) fail('cognitive-learning-verification-mismatch');
  if (verification.verified !== true) return held('verification-required', cycle);
  if (cycle.storedLesson?.promotable !== true || cycle.decision === 'hold' || cycle.decisionGate !== 'admitted') return held('cycle-not-promotable', cycle);
  const evidenceRefs = [...new Set([...(cycle.evidenceRefs ?? []), ...verification.evidenceRefs])].sort();
  const record = createInstitutionalMemoryRecord({
    memoryClass: 'outcome',
    subject: `cognitive-${slug(cycle.decision)}`,
    statement: `Verified cognitive outcome: ${cycle.decision}.`,
    provenance: 'verified-outcome',
    confidence: cycle.metacognition.calibratedConfidence,
    freshness: 'current',
    objectiveIds: [],
    evidenceRefs,
    capability: 'cognitive-cycle',
    supersedes: [],
  }, { observedAt });
  return deepFreeze({ schemaVersion: 1, kind: 'cognitive-learning-promotion', promotable: true, reason: 'verified-admitted-outcome', sourceFingerprint: cycle.fingerprint, verificationEvidenceRefs: [...verification.evidenceRefs].sort(), record });
}

function held(reason, cycle) { return deepFreeze({ schemaVersion: 1, kind: 'cognitive-learning-promotion', promotable: false, reason, sourceFingerprint: cycle.fingerprint, verificationEvidenceRefs: [], record: null }); }
function assertCycle(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'cognitive-loop-receipt' || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) fail('cognitive-learning-cycle-invalid');
}
function assertVerification(value) {
  if (!value || typeof value !== 'object' || typeof value.verified !== 'boolean' || typeof value.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 64 || value.evidenceRefs.some((item) => typeof item !== 'string' || !item.trim() || item.length > 240)) fail('cognitive-learning-verification-invalid');
}
function slug(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  if (!normalized) fail('cognitive-learning-decision-invalid');
  return normalized;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
