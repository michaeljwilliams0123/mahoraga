const DEFAULT_TTL_MS = 15_000;
const RESULTS = new Map();

export function openTransientResultChannel({ ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  const ttl = Number(ttlMs);
  if (!Number.isInteger(ttl) || ttl < 250 || ttl > 120_000) fail("channel-ttl-invalid");
  const openedAtMs = timestampMs(now);
  const id = `trc-${openedAtMs.toString(16)}-${randomToken()}`;
  const channel = Object.freeze({
    schemaVersion: 1,
    id,
    openedAt: new Date(openedAtMs).toISOString(),
    expiresAt: new Date(openedAtMs + ttl).toISOString(),
    persistence: "memory-only",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
    creditCost: 0,
    paidFallback: false,
  });
  RESULTS.set(id, { expiresAtMs: openedAtMs + ttl, results: [] });
  return channel;
}

export function isTransientChannelOpen(channel, now = Date.now()) {
  if (!isChannelShape(channel)) return false;
  if (channel.persistence !== "memory-only") return false;
  if (channel.promptPersistenceAllowed !== false || channel.responsePersistenceAllowed !== false) return false;
  if (channel.creditCost !== 0 || channel.paidFallback !== false) return false;
  return Date.parse(channel.expiresAt) > timestampMs(now);
}

export function admitLocalReasonerExecution({ verified = false, channel = null, now = Date.now() } = {}) {
  if (verified !== true) return boundary(false, "local-reasoner-not-ready");
  if (!isTransientChannelOpen(channel, now)) return boundary(false, "transient-result-channel-required");
  return boundary(true, "transient-result-channel-open", {
    channelId: channel.id,
    expiresAt: channel.expiresAt,
  });
}

export function putTransientResult(channel, input = {}, { now = Date.now() } = {}) {
  if (!isTransientChannelOpen(channel, now)) fail("transient-result-channel-required");
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("transient-result-invalid");
  if ("prompt" in input || "response" in input || "content" in input || "messages" in input) {
    fail("transient-result-content-forbidden");
  }
  const status = input.status;
  if (status !== "ok" && status !== "hold" && status !== "refused") fail("transient-result-status-invalid");
  const resultSha256 = input.resultSha256;
  if (typeof resultSha256 !== "string" || !/^[a-f0-9]{64}$/.test(resultSha256)) fail("transient-result-digest-invalid");
  sweep(timestampMs(now));
  const bucket = RESULTS.get(channel.id) ?? { expiresAtMs: Date.parse(channel.expiresAt), results: [] };
  if (bucket.results.length >= 32) fail("transient-result-cap");
  const record = Object.freeze({
    status,
    resultSha256,
    observedAt: new Date(timestampMs(now)).toISOString(),
    creditCost: 0,
    paidFallback: false,
  });
  bucket.results.push(record);
  RESULTS.set(channel.id, bucket);
  return record;
}

export function listTransientResults(channel, now = Date.now()) {
  if (!isTransientChannelOpen(channel, now)) return Object.freeze([]);
  sweep(timestampMs(now));
  const bucket = RESULTS.get(channel.id);
  return Object.freeze([...(bucket?.results ?? [])]);
}

function boundary(executionEnabled, reason, extra = {}) {
  return Object.freeze({
    executionEnabled,
    reason,
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
    creditCost: 0,
    paidFallback: false,
    ...extra,
  });
}

function isChannelShape(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && value.id.startsWith("trc-")
    && typeof value.openedAt === "string"
    && typeof value.expiresAt === "string"
    && Number.isFinite(Date.parse(value.openedAt))
    && Number.isFinite(Date.parse(value.expiresAt));
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return Date.now();
}

function sweep(nowMs) {
  for (const [id, bucket] of RESULTS) {
    if (!bucket || bucket.expiresAtMs <= nowMs) RESULTS.delete(id);
  }
}

function randomToken() {
  const bytes = new Uint8Array(6);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
