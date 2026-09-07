const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIGNALS = 64;
const STATEMENT_PREFIX = 'UNTRUSTED INTERNET EVIDENCE DATA:';

const PATTERNS = Object.freeze([
  Object.freeze({ kind: 'version', expression: /\bv?\d{1,3}\.\d{1,3}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,48})?\b/g }),
  Object.freeze({ kind: 'cve', expression: /\bCVE-\d{4}-\d{4,7}\b/gi }),
  Object.freeze({ kind: 'ghsa', expression: /\bGHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}\b/gi }),
  Object.freeze({ kind: 'date', expression: /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g }),
]);

export function deriveResearchSignals({
  bytes,
  contentType = null,
  targetHost,
  contentSha256,
  objectiveId,
  capability,
  sourceClass,
} = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES) fail('research-signal-bytes-invalid');
  const host = checkedHost(targetHost);
  const digest = checkedHash(contentSha256);
  checkedSlug(objectiveId, 96, 'research-signal-objective-invalid');
  checkedSlug(capability, 64, 'research-signal-capability-invalid');
  const normalizedSourceClass = checkedSlug(sourceClass, 64, 'research-signal-source-class-invalid');
  checkedContentType(contentType);

  const text = bytes.toString('utf8');
  const confidence = sourceConfidence(normalizedSourceClass);
  const candidates = [];
  const seen = new Set();

  addCandidate(candidates, seen, {
    kind: 'revision',
    token: digest.slice(0, 24),
    host,
    confidence,
  });

  for (const pattern of PATTERNS) {
    pattern.expression.lastIndex = 0;
    for (const match of text.matchAll(pattern.expression)) {
      addCandidate(candidates, seen, {
        kind: pattern.kind,
        token: normalizeToken(pattern.kind, match[0]),
        host,
        confidence,
      });
      if (candidates.length >= MAX_SIGNALS) break;
    }
    if (candidates.length >= MAX_SIGNALS) break;
  }

  return deepFreeze(candidates.slice(0, MAX_SIGNALS).map(({ kind, token, host: sourceHost, confidence: itemConfidence }) => ({
    memoryClass: 'observation',
    subject: subjectFor(kind, token),
    statement: `${STATEMENT_PREFIX} observed ${kind} identifier ${token} from ${sourceHost}.`,
    confidence: itemConfidence,
    freshness: 'current',
  })));
}

function addCandidate(list, seen, candidate) {
  const key = `${candidate.kind}\u0000${candidate.token.toLowerCase()}`;
  if (seen.has(key) || list.length >= MAX_SIGNALS) return;
  seen.add(key);
  list.push(candidate);
}

function normalizeToken(kind, value) {
  const text = String(value ?? '').trim();
  if (kind === 'cve' || kind === 'ghsa') return text.toUpperCase();
  return text;
}

function subjectFor(kind, token) {
  const normalized = String(token)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const subject = `internet-${kind}-${normalized || 'unknown'}`.slice(0, 96).replace(/-+$/g, '');
  return checkedSlug(subject, 96, 'research-signal-subject-invalid');
}

function sourceConfidence(sourceClass) {
  if (sourceClass === 'official-release' || sourceClass === 'official-docs' || sourceClass === 'official-standard') return 0.8;
  if (sourceClass.startsWith('official-')) return 0.75;
  return 0.55;
}

function checkedContentType(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.length > 200 || /[\0\r\n]/.test(text)) fail('research-signal-content-type-invalid');
  return text;
}

function checkedHost(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253 || !/^[A-Za-z0-9.-]+$/.test(value) || value.startsWith('.') || value.endsWith('.')) {
    fail('research-signal-host-invalid');
  }
  return value.toLowerCase();
}

function checkedHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) fail('research-signal-hash-invalid');
  return value.toLowerCase();
}

function checkedSlug(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length > maximumLength || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
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
