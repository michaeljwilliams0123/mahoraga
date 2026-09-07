import { createHash } from 'node:crypto';
import { createInstitutionalMemoryRecord } from './institutional-memory.mjs';

const SIGNAL_KEYS = new Set([
  'memoryClass',
  'subject',
  'statement',
  'confidence',
  'freshness',
]);

export function createInternetEvidencePlane({ egressController, deriveSignals = () => [] } = {}) {
  validateEgressController(egressController);
  if (typeof deriveSignals !== 'function') fail('internet-evidence-deriver-invalid');

  async function ingest({
    objectiveId,
    purpose,
    url,
    capability,
    sourceClass,
    priorContentHashes = [],
  } = {}) {
    const normalizedObjectiveId = checkedSlug(objectiveId, 96, 'internet-evidence-objective-invalid');
    const normalizedCapability = checkedSlug(capability, 64, 'internet-evidence-capability-invalid');
    const normalizedSourceClass = checkedSlug(sourceClass, 64, 'internet-evidence-source-class-invalid');
    const normalizedUrl = normalizeSourceUrl(url);
    const priorHashes = normalizeContentHashes(priorContentHashes);

    const lease = egressController.checkOut({
      objectiveId: normalizedObjectiveId,
      purpose,
      url: normalizedUrl,
    });
    const read = await egressController.read(lease.leaseId);
    const receipt = egressController.checkIn(read.leaseId, read);

    const duplicate = priorHashes.has(read.sha256);
    const sourceUrlSha256 = digest(normalizedUrl);
    const evidenceId = `evidence-${digest(JSON.stringify({
      objectiveId: normalizedObjectiveId,
      capability: normalizedCapability,
      sourceClass: normalizedSourceClass,
      sourceUrlSha256,
      contentSha256: read.sha256,
      targetHost: read.targetHost,
    })).slice(0, 32)}`;

    const record = deepFreeze({
      schemaVersion: 1,
      kind: 'internet-evidence-record',
      evidenceId,
      objectiveId: normalizedObjectiveId,
      targetHost: read.targetHost,
      sourceUrlSha256,
      contentSha256: read.sha256,
      contentType: read.contentType ?? null,
      sizeBytes: read.sizeBytes,
      status: read.status,
      observedAt: read.observedAt,
      sourceClass: normalizedSourceClass,
      noveltyScore: duplicate ? 0 : 1,
      duplicate,
      untrustedSource: true,
      authority: 'evidence-only',
      mutationAllowed: false,
      egressReceiptSha256: digest(JSON.stringify(receipt)),
      zeroCredit: true,
      providerRequired: false,
      creditCost: 0,
      paidFallback: false,
    });

    if (duplicate) {
      return deepFreeze({
        schemaVersion: 1,
        kind: 'internet-evidence-ingest-result',
        record,
        memoryRecords: [],
        zeroCredit: true,
        providerRequired: false,
        creditCost: 0,
        paidFallback: false,
      });
    }

    const rawSignals = await deriveSignals({
      bytes: read.bytes,
      contentType: read.contentType ?? null,
      targetHost: read.targetHost,
      contentSha256: read.sha256,
      objectiveId: normalizedObjectiveId,
      capability: normalizedCapability,
      sourceClass: normalizedSourceClass,
    });
    const signals = validateSignals(rawSignals);
    const memoryRecords = signals.map((signal) => createInstitutionalMemoryRecord({
      memoryClass: signal.memoryClass,
      subject: signal.subject,
      statement: signal.statement,
      provenance: 'connected-evidence',
      confidence: signal.confidence,
      freshness: signal.freshness,
      objectiveIds: [normalizedObjectiveId],
      evidenceRefs: [evidenceId],
      capability: normalizedCapability,
      supersedes: [],
    }, { observedAt: read.observedAt }));

    return deepFreeze({
      schemaVersion: 1,
      kind: 'internet-evidence-ingest-result',
      record,
      memoryRecords,
      zeroCredit: true,
      providerRequired: false,
      creditCost: 0,
      paidFallback: false,
    });
  }

  return Object.freeze({ ingest });
}

function validateSignals(value) {
  if (!Array.isArray(value) || value.length > 64) fail('internet-evidence-signals-invalid');
  return value.map((signal) => {
    exact(signal, SIGNAL_KEYS, 'internet-evidence-signal-invalid');
    const confidence = signal.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      fail('internet-evidence-signal-confidence-invalid');
    }
    return deepFreeze({
      memoryClass: checkedSlug(signal.memoryClass, 64, 'internet-evidence-signal-class-invalid'),
      subject: checkedSlug(signal.subject, 96, 'internet-evidence-signal-subject-invalid'),
      statement: checkedText(signal.statement, 4_000, 'internet-evidence-signal-statement-invalid'),
      confidence,
      freshness: checkedSlug(signal.freshness, 32, 'internet-evidence-signal-freshness-invalid'),
    });
  });
}

function validateEgressController(value) {
  if (!value || typeof value !== 'object') fail('internet-evidence-egress-invalid');
  for (const method of ['checkOut', 'read', 'checkIn']) {
    if (typeof value[method] !== 'function') fail('internet-evidence-egress-invalid');
  }
}

function normalizeSourceUrl(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048 || /[\0\r\n]/.test(value)) {
    fail('internet-evidence-url-invalid');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('internet-evidence-url-invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('internet-evidence-url-invalid');
  parsed.hash = '';
  return parsed.href;
}

function normalizeContentHashes(value) {
  if (!Array.isArray(value) || value.length > 4_096 || new Set(value).size !== value.length) {
    fail('internet-evidence-prior-hashes-invalid');
  }
  const normalized = value.map((item) => {
    if (typeof item !== 'string' || !/^[a-f0-9]{64}$/i.test(item)) fail('internet-evidence-prior-hashes-invalid');
    return item.toLowerCase();
  });
  return new Set(normalized);
}

function checkedSlug(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length > maximumLength || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function checkedText(value, maximumLength, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximumLength || /\0/.test(value)) fail(code);
  return normalized;
}

function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
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
