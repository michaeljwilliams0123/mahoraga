import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const COOKIE = "mahoraga_cloud_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const CORE_GATEWAY_URL = "http://127.0.0.1:4782/api/cloud/runtime";
const REPLAY_ROOT = process.platform === "linux" ? "/var/lib/mahoraga" : path.resolve("state", "cloud");

export type OwnerSession = { ownerId: string; sessionId: string; csrf: string; cookie?: string };

export function establishOwnerSession(request: Request): OwnerSession {
  const secret = requiredSecret();
  const existing = cookieValue(request.headers.get("cookie"), COOKIE);
  const decoded = existing ? verifyToken(existing, secret) : null;
  if (decoded) return { ownerId: decoded.ownerId, sessionId: decoded.sessionId, csrf: sign(secret, `csrf:${decoded.sessionId}`) };
  const ownerId = required("MAHORAGA_CLOUD_OWNER_ID");
  const ownerHeader = process.env.MAHORAGA_CLOUD_OWNER_HEADER?.trim().toLowerCase() || "x-mahoraga-owner";
  const assertedOwner = request.headers.get(ownerHeader) ?? "";
  const assertedAt = Number(request.headers.get("x-mahoraga-owner-timestamp"));
  const assertionNonce = request.headers.get("x-mahoraga-owner-nonce") ?? "";
  const assertionSignature = request.headers.get("x-mahoraga-owner-signature") ?? "";
  const assertionSecret = required("MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET");
  const assertion = `${assertedOwner}\n${assertedAt}\n${assertionNonce}`;
  if (!safeEqual(assertedOwner, ownerId) || !Number.isSafeInteger(assertedAt) || Math.abs(Date.now() - assertedAt) > REPLAY_WINDOW_MS || !/^[a-f0-9-]{36}$/i.test(assertionNonce)
    || !safeEqual(assertionSignature, sign(assertionSecret, assertion))) throw gatewayError("cloud-owner-auth-required", 401);
  persistNonce(`owner:${assertionNonce}`, `owner:${ownerId}`, assertedAt + REPLAY_WINDOW_MS, "cloud-owner-replay-detected");
  const sessionId = `csg-${randomUUID()}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = createToken({ ownerId, sessionId, expiresAt }, secret);
  return { ownerId, sessionId, csrf: sign(secret, `csrf:${sessionId}`), cookie: `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` };
}

export function authorizeOwnerMutation(request: Request): OwnerSession {
  const session = establishOwnerSession(request);
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(request.url).origin) throw gatewayError("cloud-same-origin-required", 403);
  if (!safeEqual(request.headers.get("x-mahoraga-csrf") ?? "", session.csrf)) throw gatewayError("cloud-csrf-required", 403);
  const nonce = request.headers.get("x-mahoraga-request-nonce") ?? "";
  const timestamp = Number(request.headers.get("x-mahoraga-request-timestamp"));
  if (!/^[a-f0-9-]{36}$/i.test(nonce) || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) throw gatewayError("cloud-replay-envelope-invalid", 403);
  persistNonce(`request:${nonce}`, session.sessionId, timestamp + REPLAY_WINDOW_MS, "cloud-replay-detected");
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
  return { status: Number.isInteger(status) ? status : 503, code: /^[a-z0-9.-]+$/.test(code) ? code : "cloud-gateway-unavailable" };
}

function replayDatabase() {
  mkdirSync(REPLAY_ROOT, { recursive: true });
  const db = new DatabaseSync(path.join(REPLAY_ROOT, "cloud-gateway.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS request_nonces(nonce TEXT PRIMARY KEY,session_id TEXT NOT NULL,expires_at INTEGER NOT NULL);");
  return db;
}
function persistNonce(nonce: string, sessionId: string, expiresAt: number, replayCode: string) {
  const db = replayDatabase();
  try {
    db.prepare("DELETE FROM request_nonces WHERE expires_at<?").run(Date.now());
    try { db.prepare("INSERT INTO request_nonces(nonce,session_id,expires_at) VALUES(?,?,?)").run(nonce, sessionId, expiresAt); }
    catch { throw gatewayError(replayCode, 409); }
  } finally { db.close(); }
}
function requiredSecret() { const value = required("MAHORAGA_CLOUD_SESSION_SECRET"); if (value.length < 32) throw gatewayError("cloud-session-secret-invalid", 503); return value; }
function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw gatewayError("cloud-gateway-not-configured", 503); return value; }
function createToken(value: { ownerId: string; sessionId: string; expiresAt: number }, secret: string) { const payload = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${payload}.${sign(secret, payload)}`; }
function verifyToken(value: string, secret: string) { const [payload, signature, extra] = value.split("."); if (!payload || !signature || extra || !safeEqual(signature, sign(secret, payload))) return null; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return typeof parsed.ownerId === "string" && /^csg-[a-f0-9-]{36}$/i.test(parsed.sessionId) && Number(parsed.expiresAt) > Date.now() ? parsed : null; } catch { return null; } }
function sign(secret: string, value: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function cookieValue(source: string | null, name: string) { return source?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function gatewayError(code: string, status: number) { const error = new Error(code) as Error & { status: number }; error.status = status; return error; }
