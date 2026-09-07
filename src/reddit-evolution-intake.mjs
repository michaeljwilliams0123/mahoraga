import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const REDDIT_EVOLUTION_INTAKE_VERSION = "reddit-evolution-intake-v1";
export const DEFAULT_REDDIT_EVOLUTION_USER = "No-Demand-4839";
export const MAX_REDDIT_INTAKE_BYTES = 32 * 1024;
export const DEFAULT_REDDIT_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const REDDIT_HOSTS = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "m.reddit.com"]);
const SIGNAL_KINDS = new Set([
  "codex-pattern",
  "devvit-capability",
  "bug-report",
  "ux-feedback",
  "integration-risk",
  "prompt-pattern",
  "community-trend",
]);
const HEADER_TIMESTAMP = "x-mahoraga-reddit-timestamp";
const HEADER_SIGNATURE = "x-mahoraga-reddit-signature";

export function verifyRedditEvolutionRequest({
  body,
  headers,
  secret,
  now = Date.now(),
  toleranceMs = DEFAULT_REDDIT_SIGNATURE_TOLERANCE_MS,
  allowedUser = DEFAULT_REDDIT_EVOLUTION_USER,
} = {}) {
  const rawBody = normalizeBody(body);
  const normalizedSecret = normalizeSecret(secret);
  if (!Number.isFinite(now) || now < 0) throw intakeError("reddit-intake-clock-invalid");
  if (!Number.isSafeInteger(toleranceMs) || toleranceMs < 1_000 || toleranceMs > 15 * 60 * 1000) throw intakeError("reddit-signature-tolerance-invalid");
  const timestamp = normalizeTimestamp(headerValue(headers, HEADER_TIMESTAMP), now, toleranceMs);
  const suppliedSignature = normalizeSignature(headerValue(headers, HEADER_SIGNATURE));
  const expectedSignature = `sha256=${createHmac("sha256", normalizedSecret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
  if (!constantEqual(suppliedSignature, expectedSignature)) throw intakeError("reddit-signature-invalid");
  const signal = normalizeRedditEvolutionSignal(JSON.parse(rawBody), { allowedUser });
  const receipt = createRedditEvolutionReceipt(signal, { timestamp });
  return Object.freeze({ signal, receipt, plan: planRedditEvolutionInput(signal) });
}

export function normalizeRedditEvolutionSignal(payload, { allowedUser = DEFAULT_REDDIT_EVOLUTION_USER } = {}) {
  if (!isRecord(payload)) throw intakeError("reddit-signal-invalid");
  const user = normalizeRedditUser(payload.redditUser ?? payload.user ?? payload.account ?? allowedUser);
  if (normalizeRedditUser(allowedUser) !== user) throw intakeError("reddit-account-mismatch");
  const references = normalizeReferences(payload);
  const kind = normalizeSignalKind(payload.signalKind ?? payload.kind ?? inferSignalKind(payload));
  const capturedAt = normalizeIsoTimestamp(payload.capturedAt ?? payload.createdAt ?? new Date(0).toISOString(), "reddit-captured-at-invalid");
  const title = boundedText(payload.title ?? payload.summary ?? kind, 280, "reddit-title-invalid");
  const body = boundedMultiline(payload.body ?? payload.text ?? payload.content ?? "", 4000, "reddit-body-text-invalid");
  const tags = normalizeTags(payload.tags ?? []);
  return Object.freeze({
    schemaVersion: 1,
    intakeVersion: REDDIT_EVOLUTION_INTAKE_VERSION,
    source: "reddit-devvit",
    account: `u/${user}`,
    eventId: normalizeEventId(payload.eventId ?? payload.id ?? digestHex(JSON.stringify({ user, references, title, body })).slice(0, 32)),
    signalKind: kind,
    capturedAt,
    title,
    body,
    tags,
    metrics: Object.freeze({
      score: boundedMetric(payload.score),
      commentCount: boundedMetric(payload.commentCount ?? payload.numComments),
      upvoteRatioBps: normalizeRatioBps(payload.upvoteRatio),
    }),
    references,
    automation: Object.freeze({
      executableInstruction: false,
      mutationAllowed: false,
      githubAuthority: false,
      requiresMahoragaReview: true,
    }),
  });
}

export function createRedditEvolutionReceipt(signal, { timestamp = null } = {}) {
  const normalized = normalizeRedditEvolutionSignal(signal, { allowedUser: signal.account?.replace(/^u\//, "") ?? DEFAULT_REDDIT_EVOLUTION_USER });
  const textDigest = digestHex(`${normalized.title}\n${normalized.body}`);
  const referenceDigest = digestHex(JSON.stringify(normalized.references));
  return Object.freeze({
    schemaVersion: 1,
    intakeVersion: REDDIT_EVOLUTION_INTAKE_VERSION,
    source: normalized.source,
    account: normalized.account,
    eventId: normalized.eventId,
    signalKind: normalized.signalKind,
    capturedAt: normalized.capturedAt,
    acceptedAt: new Date().toISOString(),
    signedTimestamp: timestamp,
    textSha256: textDigest,
    referencesSha256: referenceDigest,
    automation: normalized.automation,
  });
}

export function planRedditEvolutionInput(signal) {
  const normalized = normalizeRedditEvolutionSignal(signal, { allowedUser: signal.account?.replace(/^u\//, "") ?? DEFAULT_REDDIT_EVOLUTION_USER });
  return Object.freeze({
    schemaVersion: 1,
    planner: "reddit-evolution-input-v1",
    state: "accepted-for-review",
    mutationAllowed: false,
    codexReviewAllowed: false,
    vendedAuthority: false,
    objectiveSeed: Object.freeze({
      title: `Reddit signal: ${normalized.signalKind}`,
      taskArea: "reddit-evolution-intake",
      completionCriteria: "human-or-mahoraga-reviewed-proposal-only",
      evidence: Object.freeze({
        eventId: normalized.eventId,
        account: normalized.account,
        signalKind: normalized.signalKind,
        referenceCount: normalized.references.length,
        tagCount: normalized.tags.length,
      }),
    }),
    recommendedTasks: Object.freeze([
      readOnlyTask("observe-reddit-signal", "artifact.inspect", "Record normalized Reddit/Devvit signal provenance without executing its text."),
      readOnlyTask("classify-evolution-signal", "artifact.inspect", "Classify the signal as a candidate requirement, risk, defect, or trend."),
      readOnlyTask("draft-mahoraga-proposal", "repository.inspect", "Draft a bounded repository proposal from the signal using GitHub main as authority."),
      readOnlyTask("verify-boundaries", "repository.verify", "Verify no tunnel, backdoor, credential, or review-bypass behavior is requested."),
    ]),
  });
}

export function normalizeRedditReference(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 500) throw intakeError("reddit-reference-invalid");
  let url;
  try { url = new URL(value); } catch { throw intakeError("reddit-reference-invalid"); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !REDDIT_HOSTS.has(hostname) || url.username || url.password || url.hash) throw intakeError("reddit-reference-invalid");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(path) || path.includes("//")) throw intakeError("reddit-reference-invalid");
  const type = pathType(path);
  return Object.freeze({ type, host: hostname, path, url: `https://www.reddit.com${path}` });
}

function readOnlyTask(id, intent, requestedOutcome) {
  return Object.freeze({ id, intent, requestedOutcome, mutation: false, executionPlane: "local", priority: "normal" });
}

function normalizeBody(value) {
  if (typeof value !== "string") throw intakeError("reddit-body-invalid");
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < 2 || bytes > MAX_REDDIT_INTAKE_BYTES) throw intakeError("reddit-body-invalid");
  return value;
}

function normalizeSecret(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 512 || /\s/.test(value)) throw intakeError("reddit-ingress-secret-invalid");
  return value;
}

function normalizeTimestamp(value, now, toleranceMs) {
  if (typeof value !== "string" || !/^\d{13}$/.test(value)) throw intakeError("reddit-timestamp-invalid");
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > toleranceMs) throw intakeError("reddit-timestamp-out-of-window");
  return value;
}

function normalizeSignature(value) {
  if (typeof value !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(value)) throw intakeError("reddit-signature-invalid");
  return value.toLowerCase();
}

function constantEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function headerValue(headers, name) {
  if (!isRecord(headers)) return "";
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function normalizeRedditUser(value) {
  const user = String(value ?? "").replace(/^u\//i, "").trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(user)) throw intakeError("reddit-user-invalid");
  return user;
}

function normalizeReferences(payload) {
  const values = [];
  for (const key of ["url", "permalink", "postUrl", "commentUrl", "profileUrl", "subredditUrl"]) if (payload[key]) values.push(payload[key]);
  if (Array.isArray(payload.references)) values.push(...payload.references);
  const normalized = [...new Map(values.map((item) => {
    const reference = normalizeRedditReference(item);
    return [reference.url, reference];
  })).values()];
  if (normalized.length < 1 || normalized.length > 12) throw intakeError("reddit-reference-count-invalid");
  return Object.freeze(normalized);
}

function normalizeSignalKind(value) {
  const kind = String(value ?? "").trim().toLowerCase();
  if (!SIGNAL_KINDS.has(kind)) throw intakeError("reddit-signal-kind-invalid");
  return kind;
}

function inferSignalKind(payload) {
  const text = `${payload.title ?? ""} ${payload.body ?? payload.text ?? ""}`.toLowerCase();
  if (/devvit|reddit developer|external endpoint|http fetch/.test(text)) return "devvit-capability";
  if (/codex|code agent|github agent/.test(text)) return "codex-pattern";
  if (/bug|fail|error|broken/.test(text)) return "bug-report";
  return "community-trend";
}

function normalizeIsoTimestamp(value, code) {
  const text = String(value ?? "");
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw intakeError(code);
  return new Date(time).toISOString();
}

function normalizeTags(value) {
  if (!Array.isArray(value) || value.length > 16) throw intakeError("reddit-tags-invalid");
  return Object.freeze([...new Set(value.map((item) => {
    const tag = String(item ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag)) throw intakeError("reddit-tag-invalid");
    return tag;
  }))].sort());
}

function boundedText(value, maximum, code) {
  const text = String(value ?? "").replace(/[\r\n\u0000]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > maximum) throw intakeError(code);
  return text;
}

function boundedMultiline(value, maximum, code) {
  const text = String(value ?? "").replace(/\u0000/g, "").trim();
  if (text.length > maximum) throw intakeError(code);
  return text;
}

function boundedMetric(value) {
  if (value === undefined || value === null || value === "") return null;
  const metric = Number(value);
  if (!Number.isSafeInteger(metric) || metric < 0 || metric > 100_000_000) throw intakeError("reddit-metric-invalid");
  return metric;
}

function normalizeRatioBps(value) {
  if (value === undefined || value === null || value === "") return null;
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw intakeError("reddit-ratio-invalid");
  return Math.round(ratio * 10_000);
}

function normalizeEventId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(id)) throw intakeError("reddit-event-id-invalid");
  return id;
}

function pathType(path) {
  if (/^\/u\/[A-Za-z0-9_-]+$/i.test(path) || /^\/user\/[A-Za-z0-9_-]+$/i.test(path)) return "profile";
  if (/^\/r\/[A-Za-z0-9_]+\/comments\//i.test(path)) return "post-or-comment";
  if (/^\/r\/[A-Za-z0-9_]+\/s\//i.test(path)) return "share-link";
  if (/^\/r\/[A-Za-z0-9_]+$/i.test(path)) return "subreddit";
  throw intakeError("reddit-reference-path-invalid");
}

function digestHex(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function intakeError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
