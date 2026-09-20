import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hasTrustedRequestOrigin, nextOwnerLoginFailure, ownerLoginRetryAfter, verifyOwnerLoginPin, type OwnerLoginAttemptState } from "./owner-login";

const COOKIE = "mahoraga_cloud_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const CORE_GATEWAY_URL = "http://127.0.0.1:4782/api/cloud/runtime";
const CORE_ARTIFACT_URL = "http://127.0.0.1:4782/api/artifacts";
const DEFAULT_REPLAY_ROOT = process.platform === "linux" ? "/var/lib/mahoraga" : path.resolve("state", "cloud");
function replayRoot(env: NodeJS.ProcessEnv = process.env) { return env.MAHORAGA_PAGES_BRIDGE_REPLAY_ROOT?.trim() || DEFAULT_REPLAY_ROOT; }
export const CLOUD_OWNER_HEADER = "x-mahoraga-owner" as const;

export type OwnerSession = { ownerId: string; sessionId: string; csrf: string; cookie?: string };
export type CloudSessionCompatibility = {
  state: "ready" | "degraded" | "incompatible";
  code: "cloud-session-ready" | "cloud-runtime-degraded" | "cloud-runtime-contract-incompatible";
  fallback: { kind: "encrypted-relay"; windowsRollbackVersion: "3.6.0"; windowsRollbackPairing: "unsupported" } | null;
};

export function cloudSessionCompatibility(runtime: unknown, healthy: boolean): CloudSessionCompatibility {
  const contract = isObject(runtime) ? runtime.cloudRuntime : null;
  if (!isObject(contract) || contract.schemaVersion !== 1 || !isObject(contract.session) || contract.session.protocolVersion !== 1 || contract.session.actionProtocolVersion !== 1
    || contract.session.transport !== "same-origin-owner-session" || !isObject(contract.fallback) || contract.fallback.kind !== "encrypted-relay"
    || contract.fallback.windowsRollbackVersion !== "3.6.0" || contract.fallback.windowsRollbackPairing !== "unsupported") {
    return { state: "incompatible", code: "cloud-runtime-contract-incompatible", fallback: null };
  }
  return {
    state: healthy ? "ready" : "degraded",
    code: healthy ? "cloud-session-ready" : "cloud-runtime-degraded",
    fallback: { kind: "encrypted-relay", windowsRollbackVersion: "3.6.0", windowsRollbackPairing: "unsupported" },
  };
}

export function establishOwnerSession(request: Request): OwnerSession {
  const secret = requiredSecret();
  const existing = cookieValue(request.headers.get("cookie"), COOKIE);
  const decoded = existing ? verifyToken(existing, secret) : null;
  if (decoded) return { ownerId: decoded.ownerId, sessionId: decoded.sessionId, csrf: sign(secret, `csrf:${decoded.sessionId}`) };
  const ownerId = required("MAHORAGA_CLOUD_OWNER_ID");
  const assertedOwner = request.headers.get(CLOUD_OWNER_HEADER) ?? "";
  const assertedAtHeader = request.headers.get("x-mahoraga-owner-timestamp") ?? "";
  const assertionNonce = request.headers.get("x-mahoraga-owner-nonce") ?? "";
  const assertionSignature = request.headers.get("x-mahoraga-owner-signature") ?? "";
  const hasSignedAssertion = Boolean(assertedOwner || assertedAtHeader || assertionNonce || assertionSignature);
  if (!hasSignedAssertion) throw gatewayError("cloud-owner-auth-required", 401);
  const assertedAt = Number(assertedAtHeader);
  const assertionSecret = required("MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET");
  const assertion = `${assertedOwner}\n${assertedAt}\n${assertionNonce}`;
  if (!safeEqual(assertedOwner, ownerId) || !Number.isSafeInteger(assertedAt) || Math.abs(Date.now() - assertedAt) > REPLAY_WINDOW_MS || !/^[a-f0-9-]{36}$/i.test(assertionNonce)
    || !safeEqual(assertionSignature, sign(assertionSecret, assertion))) throw gatewayError("cloud-owner-auth-required", 401);
  persistNonce(`owner:${assertionNonce}`, `owner:${ownerId}`, assertedAt + REPLAY_WINDOW_MS, "cloud-owner-replay-detected");
  return issueOwnerSession(ownerId, secret);
}

export function verifyOwnerLoginAttempt(request: Request, suppliedPin: unknown) {
  if (!hasTrustedRequestOrigin(request)) throw gatewayError("cloud-same-origin-required", 403);
  const existingRetryAfter = ownerLoginRequestRetryAfter(request);
  if (existingRetryAfter > 0) throw gatewayError("cloud-owner-login-rate-limited", 429, existingRetryAfter);
  const login = verifyOwnerLoginPin(suppliedPin);
  if (!login.ok) {
    if (login.code === "cloud-owner-login-required") {
      const retryAfter = recordOwnerLoginFailure(request);
      if (retryAfter > 0) throw gatewayError("cloud-owner-login-rate-limited", 429, retryAfter);
    }
    throw gatewayError(login.code, login.code === "cloud-owner-login-required" ? 401 : 503);
  }
  clearOwnerLoginFailures(request);
  return { ownerId: required("MAHORAGA_CLOUD_OWNER_ID") };
}

export function establishOwnerLoginSession(request: Request, suppliedPin: unknown): OwnerSession {
  const verified = verifyOwnerLoginAttempt(request, suppliedPin);
  return issueOwnerSession(verified.ownerId, requiredSecret());
}

function issueOwnerSession(ownerId: string, secret: string): OwnerSession {
  const sessionId = `csg-${randomUUID()}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = createToken({ ownerId, sessionId, expiresAt }, secret);
  return { ownerId, sessionId, csrf: sign(secret, `csrf:${sessionId}`), cookie: `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` };
}

export function authorizeOwnerMutation(request: Request): OwnerSession {
  const session = establishOwnerSession(request);
  if (!hasTrustedRequestOrigin(request)) throw gatewayError("cloud-same-origin-required", 403);
  if (!safeEqual(request.headers.get("x-mahoraga-csrf") ?? "", session.csrf)) throw gatewayError("cloud-csrf-required", 403);
  const nonce = request.headers.get("x-mahoraga-request-nonce") ?? "";
  const timestamp = Number(request.headers.get("x-mahoraga-request-timestamp"));
  if (!/^[a-f0-9-]{36}$/i.test(nonce) || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) throw gatewayError("cloud-replay-envelope-invalid", 403);
  reserveCloudReplayNonce(`request:${nonce}`, session.sessionId, timestamp + REPLAY_WINDOW_MS, "cloud-replay-detected");
  return session;
}

export async function coreRequest(type: string, payload: unknown = {}) {
  const token = required("MAHORAGA_PRIMARY_CODEX_TOKEN");
  const signal = AbortSignal.timeout(15_000);
  return fetch(CORE_GATEWAY_URL, {
    method: "POST", cache: "no-store", signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, payload }),
  });
}

export function gatewayFailure(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 503;
  const code = error instanceof Error ? error.message : "cloud-gateway-unavailable";
  const retryAfterSeconds = typeof error === "object" && error && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 0;
  return {
    status: Number.isInteger(status) ? status : 503,
    code: /^[a-z0-9.-]+$/.test(code) ? code : "cloud-gateway-unavailable",
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : 0,
  };
}

function replayDatabase(env: NodeJS.ProcessEnv = process.env) {
  const root = replayRoot(env);
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, "cloud-gateway.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS request_nonces(nonce TEXT PRIMARY KEY,session_id TEXT NOT NULL,expires_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS owner_login_attempts(key TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_started_at INTEGER NOT NULL,locked_until INTEGER NOT NULL);");
  return db;
}
export function reserveCloudReplayNonce(nonce: string, sessionId: string, expiresAt: number, replayCode: string, env: NodeJS.ProcessEnv = process.env) {
  const db = replayDatabase(env);
  try {
    db.prepare("DELETE FROM request_nonces WHERE expires_at<?").run(Date.now());
    try { db.prepare("INSERT INTO request_nonces(nonce,session_id,expires_at) VALUES(?,?,?)").run(nonce, sessionId, expiresAt); }
    catch { throw gatewayError(replayCode, 409); }
  } finally { db.close(); }
}
const OWNER_LOGIN_CLIENT_MAX_FAILURES = 5;
const OWNER_LOGIN_GLOBAL_MAX_FAILURES = 25;
function ownerLoginClientKey(request: Request) {
  const source = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return `client:${sign(required("MAHORAGA_CLOUD_OWNER_LOGIN_SECRET"), `owner-login-client:${source}`)}`;
}
function ownerLoginAttemptKeys(request: Request): Array<[string, number]> {
  return [[ownerLoginClientKey(request), OWNER_LOGIN_CLIENT_MAX_FAILURES], ["global", OWNER_LOGIN_GLOBAL_MAX_FAILURES]];
}
function readOwnerLoginAttempt(db: DatabaseSync, key: string): OwnerLoginAttemptState | null {
  const row = db.prepare("SELECT failures,window_started_at,locked_until FROM owner_login_attempts WHERE key=?").get(key) as { failures?: unknown; window_started_at?: unknown; locked_until?: unknown } | undefined;
  if (!row) return null;
  const state = { failures: Number(row.failures), windowStartedAt: Number(row.window_started_at), lockedUntil: Number(row.locked_until) };
  return Number.isInteger(state.failures) && Number.isFinite(state.windowStartedAt) && Number.isFinite(state.lockedUntil) ? state : null;
}
function ownerLoginRequestRetryAfter(request: Request) {
  const db = replayDatabase();
  try { return Math.max(...ownerLoginAttemptKeys(request).map(([key]) => ownerLoginRetryAfter(readOwnerLoginAttempt(db, key)))); }
  finally { db.close(); }
}
function recordOwnerLoginFailure(request: Request) {
  const db = replayDatabase();
  try {
    const now = Date.now();
    let retryAfter = 0;
    for (const [key, maxFailures] of ownerLoginAttemptKeys(request)) {
      const next = nextOwnerLoginFailure(readOwnerLoginAttempt(db, key), now, maxFailures);
      db.prepare("INSERT INTO owner_login_attempts(key,failures,window_started_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until")
        .run(key, next.failures, next.windowStartedAt, next.lockedUntil);
      retryAfter = Math.max(retryAfter, ownerLoginRetryAfter(next, now));
    }
    return retryAfter;
  } finally { db.close(); }
}
function clearOwnerLoginFailures(request: Request) {
  const db = replayDatabase();
  try {
    const clientKey = ownerLoginClientKey(request);
    db.prepare("DELETE FROM owner_login_attempts WHERE key=? OR key='global'").run(clientKey);
  } finally { db.close(); }
}
function requiredSecret() { const value = required("MAHORAGA_CLOUD_SESSION_SECRET"); if (value.length < 32) throw gatewayError("cloud-session-secret-invalid", 503); return value; }
function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw gatewayError("cloud-gateway-not-configured", 503); return value; }
function createToken(value: { ownerId: string; sessionId: string; expiresAt: number }, secret: string) { const payload = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${payload}.${sign(secret, payload)}`; }
function verifyToken(value: string, secret: string) { const [payload, signature, extra] = value.split("."); if (!payload || !signature || extra || !safeEqual(signature, sign(secret, payload))) return null; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return typeof parsed.ownerId === "string" && /^csg-[a-f0-9-]{36}$/i.test(parsed.sessionId) && Number(parsed.expiresAt) > Date.now() ? parsed : null; } catch { return null; } }
function sign(secret: string, value: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function cookieValue(source: string | null, name: string) { return source?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function gatewayError(code: string, status: number, retryAfterSeconds = 0) { const error = new Error(code) as Error & { status: number; retryAfterSeconds?: number }; error.status = status; if (retryAfterSeconds > 0) error.retryAfterSeconds = retryAfterSeconds; return error; }
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export async function coreArtifactRequest(input: { name: string; mimeType: string; source: string; bytes: Uint8Array }) {
  const token = required("MAHORAGA_PRIMARY_CODEX_TOKEN");
  const signal = AbortSignal.timeout(15_000);
  const body = Uint8Array.from(input.bytes).buffer;
  return fetch(CORE_ARTIFACT_URL, {
    method: "POST", cache: "no-store", signal,
    headers: {
      "content-type": input.mimeType,
      authorization: `Bearer ${token}`,
      "x-mahoraga-file-name": encodeURIComponent(input.name),
      "x-mahoraga-file-source": input.source,
    },
    body,
  });
}
