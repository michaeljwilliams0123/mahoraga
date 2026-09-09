import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export const UNIVERSAL_ARTIFACT_SCHEMA_VERSION = 1;

const SOURCE_KEYS = new Set(["sourceType", "provider", "objectId", "locator", "accountBoundary"]);
const RECORD_KEYS = new Set([
  "schemaVersion",
  "artifactId",
  "source",
  "fileName",
  "mimeType",
  "sizeBytes",
  "sha256",
  "artifactKind",
  "classification",
  "contentReference",
  "createdAt",
  "expiresAt",
  "features",
  "routeHints",
  "zeroCreditEligible",
  "providerRequired",
]);
const SOURCE_TYPES = new Set(["local-file", "cloud-file", "message-attachment", "repository-artifact", "browser-download"]);
const PROVIDERS = new Set(["local", "microsoft", "google", "github", "browser", "unknown"]);
const ACCOUNT_BOUNDARIES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const ROUTE_HINTS = new Set(["artifact.inspect", "m365.open", "google.open", "repository.inspect"]);
const SECRET = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml", ".log", ".ini", ".cfg", ".conf", ".sql", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html", ".htm", ".py", ".ps1", ".sh", ".bat", ".cmd", ".java", ".cs", ".go", ".rs", ".eml"]);
const STRUCTURED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".vsd", ".vsdx", ".msg", ".zip"]);

export function createUniversalArtifactSource(value) {
  exact(value, SOURCE_KEYS, "universal-artifact-source-invalid");
  return deepFreeze({
    sourceType: allowed(value.sourceType, SOURCE_TYPES, "universal-artifact-source-invalid"),
    provider: allowed(value.provider, PROVIDERS, "universal-artifact-source-invalid"),
    objectId: bounded(value.objectId, 160, "universal-artifact-source-invalid", /^[A-Za-z0-9][A-Za-z0-9._:@/#-]*$/),
    locator: safeText(value.locator, 240, "universal-artifact-source-invalid"),
    accountBoundary: allowed(value.accountBoundary, ACCOUNT_BOUNDARIES, "universal-artifact-source-invalid"),
  });
}

export function ingestUniversalArtifact({ source, fileName, mimeType, bytes, classification = null, ttlMs = 90 * 24 * 60 * 60 * 1000 }, { contentVault, now = () => new Date() } = {}) {
  if (!contentVault || typeof contentVault.put !== "function") throw error("universal-artifact-vault-required");
  const normalizedSource = createUniversalArtifactSource(source);
  const name = safeFileName(fileName);
  const type = bounded(String(mimeType ?? "application/octet-stream").toLowerCase(), 120, "universal-artifact-mime-invalid", /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i);
  const buffer = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes ?? []);
  if (buffer.length < 1 || buffer.length > 100 * 1024 * 1024) throw error(buffer.length < 1 ? "universal-artifact-empty" : "universal-artifact-too-large");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 365 * 24 * 60 * 60 * 1000) throw error("universal-artifact-ttl-invalid");
  const createdAt = timestamp(now());
  const expiresAt = new Date(Date.parse(createdAt) + ttlMs).toISOString();
  const resolvedClassification = classification ?? defaultClassification(normalizedSource);
  const features = summarizeFeatures(name, type, buffer);
  const artifactId = `uart-${randomUUID()}`;
  const contentReference = contentVault.put(buffer, {
    classification: resolvedClassification,
    ownerType: "artifact",
    ownerId: artifactId,
    ttlMs,
  });
  const record = {
    schemaVersion: UNIVERSAL_ARTIFACT_SCHEMA_VERSION,
    artifactId,
    source: normalizedSource,
    fileName: name,
    mimeType: type,
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    artifactKind: features.artifactKind,
    classification: resolvedClassification,
    contentReference,
    createdAt,
    expiresAt,
    features,
    routeHints: deriveRouteHints(normalizedSource, features),
    zeroCreditEligible: true,
    providerRequired: false,
  };
  return validateUniversalArtifactRecord(record);
}

export function validateUniversalArtifactRecord(value) {
  exact(value, RECORD_KEYS, "universal-artifact-record-invalid");
  if (value.schemaVersion !== UNIVERSAL_ARTIFACT_SCHEMA_VERSION) throw error("universal-artifact-record-invalid");
  const source = createUniversalArtifactSource(value.source);
  const features = normalizeFeatures(value.features);
  const routeHints = normalizeRouteHints(value.routeHints);
  const createdAt = timestamp(value.createdAt);
  const expiresAt = timestamp(value.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw error("universal-artifact-record-invalid");
  if (typeof value.zeroCreditEligible !== "boolean" || typeof value.providerRequired !== "boolean") throw error("universal-artifact-record-invalid");
  if (value.zeroCreditEligible !== true || value.providerRequired !== false) throw error("universal-artifact-provider-boundary-invalid");
  return deepFreeze({
    schemaVersion: UNIVERSAL_ARTIFACT_SCHEMA_VERSION,
    artifactId: bounded(value.artifactId, 48, "universal-artifact-record-invalid", /^uart-[a-f0-9-]{36}$/),
    source,
    fileName: safeFileName(value.fileName),
    mimeType: bounded(value.mimeType, 120, "universal-artifact-mime-invalid", /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i),
    sizeBytes: boundedInteger(value.sizeBytes, 1, 100 * 1024 * 1024, "universal-artifact-record-invalid"),
    sha256: bounded(value.sha256, 64, "universal-artifact-record-invalid", /^[a-f0-9]{64}$/),
    artifactKind: features.artifactKind,
    classification: allowed(value.classification, ACCOUNT_BOUNDARIES, "universal-artifact-record-invalid"),
    contentReference: bounded(value.contentReference, 160, "universal-artifact-record-invalid", /^vault:[a-f0-9-]{36}$/),
    createdAt,
    expiresAt,
    features,
    routeHints,
    zeroCreditEligible: true,
    providerRequired: false,
  });
}

function summarizeFeatures(fileName, mimeType, bytes) {
  const extension = path.extname(fileName).toLowerCase();
  if (mimeType.startsWith("image/")) {
    const dimensions = imageDimensions(mimeType, bytes);
    return deepFreeze({ artifactKind: "image", extension, textLike: false, structured: false, width: dimensions.width, height: dimensions.height, lineCount: 0, rowCount: 0, pageHint: mimeType === "application/pdf" ? 1 : 0 });
  }
  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const text = new TextDecoder("utf8", { fatal: false }).decode(bytes);
    const rows = extension === ".csv" || extension === ".tsv" ? text.split(/\r?\n/).filter(Boolean).length : 0;
    return deepFreeze({ artifactKind: extension === ".csv" || extension === ".tsv" ? "tabular" : "text", extension, textLike: true, structured: false, width: null, height: null, lineCount: text.split(/\r?\n/).length, rowCount: rows, pageHint: 0 });
  }
  if (mimeType === "application/pdf" || STRUCTURED_EXTENSIONS.has(extension)) {
    return deepFreeze({ artifactKind: extension === ".eml" || extension === ".msg" ? "message" : "structured-document", extension, textLike: false, structured: true, width: null, height: null, lineCount: 0, rowCount: 0, pageHint: mimeType === "application/pdf" ? 1 : 0 });
  }
  return deepFreeze({ artifactKind: "binary", extension, textLike: false, structured: false, width: null, height: null, lineCount: 0, rowCount: 0, pageHint: 0 });
}

function normalizeFeatures(value) {
  exact(value, new Set(["artifactKind", "extension", "textLike", "structured", "width", "height", "lineCount", "rowCount", "pageHint"]), "universal-artifact-record-invalid");
  const artifactKind = bounded(value.artifactKind, 32, "universal-artifact-record-invalid", /^(?:text|tabular|image|structured-document|message|binary)$/);
  const extension = typeof value.extension === "string" ? value.extension.toLowerCase() : "";
  if (extension.length > 20 || (extension && !/^\.[a-z0-9]{1,10}$/.test(extension))) throw error("universal-artifact-record-invalid");
  for (const flag of ["textLike", "structured"]) if (typeof value[flag] !== "boolean") throw error("universal-artifact-record-invalid");
  const width = nullableBoundedInteger(value.width, 1, 20000, "universal-artifact-record-invalid");
  const height = nullableBoundedInteger(value.height, 1, 20000, "universal-artifact-record-invalid");
  const lineCount = boundedInteger(value.lineCount, 0, 5_000_000, "universal-artifact-record-invalid");
  const rowCount = boundedInteger(value.rowCount, 0, 5_000_000, "universal-artifact-record-invalid");
  const pageHint = boundedInteger(value.pageHint, 0, 100_000, "universal-artifact-record-invalid");
  return deepFreeze({ artifactKind, extension, textLike: value.textLike, structured: value.structured, width, height, lineCount, rowCount, pageHint });
}

function deriveRouteHints(source, features) {
  const hints = ["artifact.inspect"];
  if (source.provider === "microsoft") hints.push("m365.open");
  if (source.provider === "google") hints.push("google.open");
  if (source.provider === "github") hints.push("repository.inspect");
  return normalizeRouteHints([...new Set(hints)]);
}

function normalizeRouteHints(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4 || new Set(value).size !== value.length) throw error("universal-artifact-record-invalid");
  return deepFreeze(value.map((item) => allowed(item, ROUTE_HINTS, "universal-artifact-record-invalid")).sort());
}

function defaultClassification(source) {
  if (source.accountBoundary === "enterprise") return "enterprise";
  if (source.accountBoundary === "personal") return "personal";
  return "local-only";
}

function imageDimensions(mimeType, bytes) {
  if (mimeType === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return { width: null, height: null };
}

function safeFileName(value) {
  const text = safeText(value, 200, "universal-artifact-name-invalid");
  const base = path.basename(text);
  if (!base || base === "." || base === "..") throw error("universal-artifact-name-invalid");
  return base;
}

function safeText(value, maximum, code) {
  if (typeof value !== "string") throw error(code);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /[\0\r\n]/.test(value) || SECRET.test(normalized)) throw error(code);
  return normalized;
}

function timestamp(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) throw error("universal-artifact-time-invalid");
  return text;
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) throw error(code);
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value) || SECRET.test(value) || !pattern.test(value)) throw error(code);
  return value;
}

function allowed(value, values, code) {
  if (!values.has(value)) throw error(code);
  return value;
}

function boundedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw error(code);
  return value;
}

function nullableBoundedInteger(value, minimum, maximum, code) {
  if (value === null) return null;
  return boundedInteger(value, minimum, maximum, code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function error(code) {
  const value = new TypeError(code);
  value.code = code;
  return value;
}
