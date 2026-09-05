import crypto from 'node:crypto';

const OUTCOMES = new Set(['success', 'failure', 'blocked']);
const FEAT_KEYS = new Set(['schemaVersion', 'featId', 'agentId', 'capability', 'outcome', 'summary', 'evidence', 'learnedAt', 'zeroCredit', 'reusable']);

export function createAgentFeat(input, { learnedAt = new Date().toISOString() } = {}) {
  const evidence = normalizeEvidence(input.evidence ?? []);
  const core = {
    agentId: checkedSlug(input.agentId, 'agent id'),
    capability: checkedSlug(input.capability, 'capability'),
    outcome: checkedOutcome(input.outcome),
    summary: checkedText(input.summary, 1000, 'feat summary'),
    evidence,
    learnedAt: checkedTimestamp(learnedAt, 'feat learned time'),
  };
  const featId = `feat-${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 24)}`;
  return validateAgentFeat({
    schemaVersion: 1,
    featId,
    ...core,
    zeroCredit: true,
    reusable: core.outcome === 'success' && evidence.length > 0,
  });
}

export function validateAgentFeat(value) {
  exact(value, FEAT_KEYS, 'agent feat');
  if (value.schemaVersion !== 1) fail('agent-feat-schema-invalid');
  if (typeof value.featId !== 'string' || !/^feat-[a-f0-9]{24}$/.test(value.featId)) fail('agent-feat-id-invalid');
  checkedSlug(value.agentId, 'agent id');
  checkedSlug(value.capability, 'capability');
  checkedOutcome(value.outcome);
  checkedText(value.summary, 1000, 'feat summary');
  normalizeEvidence(value.evidence);
  checkedTimestamp(value.learnedAt, 'feat learned time');
  if (value.zeroCredit !== true) fail('agent-feat-zero-credit-required');
  const expectedReusable = value.outcome === 'success' && value.evidence.length > 0;
  if (value.reusable !== expectedReusable) fail('agent-feat-reusable-invalid');
  return deepFreeze(structuredClone(value));
}

export function buildAgentFeatLedger({ sourceFingerprint, feats = [] } = {}) {
  checkedFingerprint(sourceFingerprint, 'source fingerprint');
  if (!Array.isArray(feats) || feats.length > 10_000) fail('agent-feat-list-invalid');
  const unique = new Map();
  for (const raw of feats) {
    const feat = validateAgentFeat(raw);
    if (!unique.has(feat.featId)) unique.set(feat.featId, feat);
  }
  const ordered = [...unique.values()].sort((a, b) => a.agentId.localeCompare(b.agentId) || a.learnedAt.localeCompare(b.learnedAt) || a.featId.localeCompare(b.featId));
  const byAgent = {};
  for (const feat of ordered) (byAgent[feat.agentId] ??= []).push(feat);
  const reusableFeatIds = ordered.filter((feat) => feat.reusable).map((feat) => feat.featId).sort();
  return deepFreeze({ schemaVersion: 1, sourceFingerprint: sourceFingerprint.toLowerCase(), feats: ordered, reusableFeatIds, byAgent });
}

function normalizeEvidence(value) {
  if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length) fail('agent-feat-evidence-invalid');
  return value.map((item) => checkedText(item, 240, 'feat evidence')).sort();
}
function checkedOutcome(value) { if (!OUTCOMES.has(value)) fail('agent-feat-outcome-invalid'); return value; }
function checkedSlug(value, label) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function checkedText(value, max, label) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function checkedTimestamp(value, label) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function checkedFingerprint(value, label) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function exact(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(`${label.replace(/ /g, '-')}-invalid`); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
