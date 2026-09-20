import { createHash } from 'node:crypto';

const EVIDENCE_KEYS = new Set(['evidenceRef', 'status', 'freshness', 'lineageRoot', 'supersededBy']);
const HISTORY_KEYS = new Set(['individualId', 'conclusion', 'dissentTags', 'evidenceRefs', 'unresolvedCycles', 'lastObservation']);
const EVIDENCE_STATUSES = new Set(['valid', 'invalid', 'refuted']);
const FRESHNESS = new Set(['current', 'aging', 'stale', 'historical']);
const OBSERVATIONS = new Set([
  'none',
  'requested',
  'performed-supports-dissent',
  'performed-supports-alternative',
  'performed-inconclusive',
]);
const DISSENT_ESCALATION_CYCLES = 3;
const REQUIRED_ALTERNATIVE_PARTICIPANTS = 2;
const REQUIRED_ALTERNATIVE_LINEAGES = 2;

export function resolveCollectiveDissent({ positions = [], materialDissent = [], evidenceLedger = [], dissentHistory = [] } = {}) {
  if (!Array.isArray(positions) || positions.length > 12 || !Array.isArray(materialDissent) || materialDissent.length > 12) fail('collective-dissent-resolution-invalid');
  const ledger = normalizeEvidenceLedger(evidenceLedger);
  const history = normalizeHistory(dissentHistory);
  const dissentIds = new Set(materialDissent.map((item) => checkedSlug(item?.individualId, 'collective-dissent-resolution-invalid')));
  const positionById = new Map(positions.map((item) => [checkedSlug(item?.individualId, 'collective-dissent-resolution-invalid'), item]));
  const alternativeSupport = strongestAlternativeSupport({ positions, dissentIds, ledger });
  const items = materialDissent.map((dissent) => {
    const position = positionById.get(dissent.individualId);
    if (!position) fail('collective-dissent-position-missing');
    const evidenceRefs = checkedList(position.evidenceRefs, 32, 'collective-dissent-resolution-invalid');
    const evidence = evidenceRefs.map((evidenceRef) => publicEvidence(evidenceRef, ledger.get(evidenceRef)));
    const currentValid = evidence.filter((item) => item.status === 'valid' && item.freshness === 'current' && item.supersededBy === null);
    const fullyCovered = evidence.every((item) => item.status !== 'unverified');
    const degraded = fullyCovered && evidence.length > 0 && currentValid.length === 0 && evidence.every(isDegradedEvidence);
    const historyEntry = matchingHistory(history.get(dissent.individualId), dissent, evidenceRefs);
    const unresolvedCycles = historyEntry?.unresolvedCycles ?? 0;
    const priorObservation = historyEntry?.lastObservation ?? 'none';
    const alternativeQualified = alternativeSupport.qualified && alternativeSupport.conclusion !== dissent.conclusion;
    const blocking = !(degraded && alternativeQualified);
    const escalation = blocking && currentValid.length > 0 && unresolvedCycles >= DISSENT_ESCALATION_CYCLES && priorObservation === 'performed-supports-alternative';
    const reasonCode = classifyReason({ fullyCovered, currentValid, degraded, alternativeQualified, escalation });
    return deepFreeze({
      individualId: dissent.individualId,
      dissentTags: [...dissent.dissentTags],
      evidenceRefs,
      evidence,
      confidenceBefore: dissent.confidence,
      confidenceAfter: currentValid.length > 0 ? dissent.confidence : null,
      unresolvedCycles,
      blocking,
      escalation,
      reasonCode,
      observation: { priorStatus: priorObservation, nextAction: escalation ? 'escalate' : blocking ? 'reobserve' : 'none' },
    });
  });
  const core = {
    schemaVersion: 1,
    kind: 'collective-dissent-resolution',
    blockingCount: items.filter((item) => item.blocking).length,
    preservedNonBlockingCount: items.filter((item) => !item.blocking).length,
    escalationCount: items.filter((item) => item.escalation).length,
    alternativeSupport,
    items,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

function strongestAlternativeSupport({ positions, dissentIds, ledger }) {
  const groups = new Map();
  for (const position of positions) {
    const individualId = checkedSlug(position?.individualId, 'collective-dissent-resolution-invalid');
    if (dissentIds.has(individualId)) continue;
    const conclusion = checkedToken(position?.conclusion, 96, 'collective-dissent-resolution-invalid');
    const refs = checkedList(position?.evidenceRefs, 32, 'collective-dissent-resolution-invalid');
    const current = refs.map((ref) => ledger.get(ref)).filter((item) => item?.status === 'valid' && item.freshness === 'current' && item.supersededBy === null);
    if (current.length === 0) continue;
    const group = groups.get(conclusion) ?? { conclusion, participantIds: new Set(), lineageRoots: new Set(), confidence: 0 };
    group.participantIds.add(individualId);
    current.forEach((item) => group.lineageRoots.add(item.lineageRoot));
    group.confidence = Math.max(group.confidence, Number(position.confidence) || 0);
    groups.set(conclusion, group);
  }
  const ranked = [...groups.values()].sort((a, b) =>
    Number(isQualifiedAlternative(b)) - Number(isQualifiedAlternative(a)) ||
    b.lineageRoots.size - a.lineageRoots.size ||
    b.participantIds.size - a.participantIds.size ||
    b.confidence - a.confidence ||
    a.conclusion.localeCompare(b.conclusion));
  const best = ranked[0];
  if (!best) return deepFreeze({ conclusion: null, currentIndependentLineageCount: 0, currentParticipantCount: 0, lineageRoots: [], qualified: false });
  return deepFreeze({
    conclusion: best.conclusion,
    currentIndependentLineageCount: best.lineageRoots.size,
    currentParticipantCount: best.participantIds.size,
    lineageRoots: [...best.lineageRoots].sort(),
    qualified: isQualifiedAlternative(best),
  });
}

function isQualifiedAlternative(group) { return group.lineageRoots.size >= REQUIRED_ALTERNATIVE_LINEAGES && group.participantIds.size >= REQUIRED_ALTERNATIVE_PARTICIPANTS; }

function normalizeEvidenceLedger(value) {
  if (!Array.isArray(value) || value.length > 512) fail('collective-dissent-evidence-invalid');
  const map = new Map();
  for (const raw of value) {
    exact(raw, EVIDENCE_KEYS, 'collective-dissent-evidence-invalid');
    const item = deepFreeze({
      evidenceRef: checkedRef(raw.evidenceRef, 'collective-dissent-evidence-invalid'),
      status: allowed(raw.status, EVIDENCE_STATUSES, 'collective-dissent-evidence-invalid'),
      freshness: allowed(raw.freshness, FRESHNESS, 'collective-dissent-evidence-invalid'),
      lineageRoot: checkedRef(raw.lineageRoot, 'collective-dissent-evidence-invalid'),
      supersededBy: raw.supersededBy === null ? null : checkedRef(raw.supersededBy, 'collective-dissent-evidence-invalid'),
    });
    if (map.has(item.evidenceRef)) fail('collective-dissent-evidence-duplicate');
    map.set(item.evidenceRef, item);
  }
  for (const item of map.values()) {
    if (item.supersededBy !== null && !map.has(item.supersededBy)) fail('collective-dissent-evidence-supersession-target-missing');
  }
  return map;
}

function normalizeHistory(value) {
  if (!Array.isArray(value) || value.length > 12) fail('collective-dissent-history-invalid');
  const map = new Map();
  for (const raw of value) {
    exact(raw, HISTORY_KEYS, 'collective-dissent-history-invalid');
    const item = deepFreeze({
      individualId: checkedSlug(raw.individualId, 'collective-dissent-history-invalid'),
      conclusion: checkedToken(raw.conclusion, 96, 'collective-dissent-history-invalid'),
      dissentTags: checkedSlugList(raw.dissentTags, 16, 'collective-dissent-history-invalid'),
      evidenceRefs: checkedList(raw.evidenceRefs, 32, 'collective-dissent-history-invalid'),
      unresolvedCycles: checkedInteger(raw.unresolvedCycles, 0, 64, 'collective-dissent-history-invalid'),
      lastObservation: allowed(raw.lastObservation, OBSERVATIONS, 'collective-dissent-history-invalid'),
    });
    if (map.has(item.individualId)) fail('collective-dissent-history-duplicate');
    map.set(item.individualId, item);
  }
  return map;
}
function matchingHistory(item, dissent, evidenceRefs) {
  if (!item) return null;
  const tags = checkedSlugList(dissent.dissentTags, 16, 'collective-dissent-resolution-invalid');
  return item.conclusion === dissent.conclusion && sameList(item.dissentTags, tags) && sameList(item.evidenceRefs, evidenceRefs) ? item : null;
}

function publicEvidence(evidenceRef, item) {
  if (!item) return deepFreeze({ evidenceRef, status: 'unverified', freshness: 'unknown', lineageRoot: null, supersededBy: null });
  return deepFreeze({
    evidenceRef: item.evidenceRef,
    status: item.status,
    freshness: item.freshness,
    lineageRoot: item.lineageRoot,
    supersededBy: item.supersededBy,
  });
}

function isDegradedEvidence(item) {
  return item.status === 'invalid' || item.status === 'refuted' || item.freshness === 'stale' || item.freshness === 'historical' || item.supersededBy !== null;
}

function classifyReason({ fullyCovered, currentValid, degraded, alternativeQualified, escalation }) {
  if (escalation) return 'dissent-resolution-escalated';
  if (!fullyCovered) return 'evidence-unverified';
  if (currentValid.length > 0) return 'current-valid-dissent';
  if (degraded && alternativeQualified) return 'degraded-dissent-with-independent-alternative';
  if (degraded) return 'degraded-dissent-without-independent-alternative';
  return 'dissent-evidence-reobservation-required';
}
function checkedList(value, maximum, code) {
  if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedRef(item, code)).sort();
}
function checkedSlugList(value, maximum, code) {
  if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, code)).sort();
}
function checkedRef(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) fail(code);
  return value;
}
function checkedSlug(value, code) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code);
  return value;
}
function checkedToken(value, maximum, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(code);
  return value;
}
function checkedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function allowed(value, values, code) { if (!values.has(value)) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function sameList(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
