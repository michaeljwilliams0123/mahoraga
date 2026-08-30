import { randomBytes, timingSafeEqual } from "node:crypto";
import { bearerMatches } from "./local-auth.mjs";

export const CONTROL_SESSION_COOKIE = "mahoraga_session";
export const DEFAULT_SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
export const DEFAULT_BOOTSTRAP_NONCE_TTL_MS = 30_000;

export function createControlSessionManager({
  now = () => Date.now(),
  random = (size) => randomBytes(size),
  idleTtlMs = DEFAULT_SESSION_IDLE_TTL_MS,
  nonceTtlMs = DEFAULT_BOOTSTRAP_NONCE_TTL_MS,
} = {}) {
  if (!Number.isInteger(idleTtlMs) || idleTtlMs < 60_000) throw new TypeError("session-idle-ttl-invalid");
  if (!Number.isInteger(nonceTtlMs) || nonceTtlMs < 1_000 || nonceTtlMs > 60_000) throw new TypeError("bootstrap-nonce-ttl-invalid");
  const nonces = new Map();
  const sessions = new Map();
  const issue = () => random(32).toString("base64url");
  const prune = () => {
    const current = now();
    for (const [value, expiresAt] of nonces) if (expiresAt < current) nonces.delete(value);
    for (const [value, expiresAt] of sessions) if (expiresAt < current) sessions.delete(value);
  };

  return Object.freeze({
    issueBootstrapNonce() {
      prune();
      const value = issue();
      nonces.set(value, now() + nonceTtlMs);
      return value;
    },
    exchangeBootstrapNonce(value) {
      if (typeof value !== "string" || value.length < 32) throw sessionError("bootstrap-nonce-invalid");
      const match = matchingKey(nonces, value);
      if (!match) throw sessionError("bootstrap-nonce-invalid");
      const expiresAt = nonces.get(match);
      nonces.delete(match);
      if (expiresAt < now()) throw sessionError("bootstrap-nonce-expired");
      const sessionId = issue();
      sessions.set(sessionId, now() + idleTtlMs);
      return { authenticated: true, sessionId, idleTtlMs };
    },
    authenticateCookie(value) {
      if (typeof value !== "string" || value.length < 32) return false;
      const match = matchingKey(sessions, value);
      if (!match) return false;
      const expiresAt = sessions.get(match);
      if (expiresAt < now()) {
        sessions.delete(match);
        return false;
      }
      sessions.set(match, now() + idleTtlMs);
      return true;
    },
    revokeSession(value) {
      const match = matchingKey(sessions, value);
      if (match) sessions.delete(match);
      return Boolean(match);
    },
    snapshot() {
      prune();
      return { activeSessions: sessions.size, pendingNonces: nonces.size, idleTtlMs, nonceTtlMs };
    },
  });
}

export function classifyApiRoute(method, pathname) {
  if (method === "GET" && ["/api/status", "/api/identity"].includes(pathname)) return "public";
  if (pathname.startsWith("/api/") || pathname.startsWith("/artifacts/")) return method === "GET" ? "sensitive-read" : "mutation";
  return "static";
}

export function authenticateLocalRequest(request, { primaryToken, sessions }) {
  if (bearerMatches(request, primaryToken)) return { authenticated: true, mechanism: "bearer", sessionId: null };
  const sessionId = parseCookies(request.headers.cookie)[CONTROL_SESSION_COOKIE];
  if (sessionId && sessions.authenticateCookie(sessionId)) return { authenticated: true, mechanism: "cookie", sessionId };
  return { authenticated: false, mechanism: null, sessionId: null };
}

export function cookieMutationOriginAllowed(request, expectedOrigin) {
  const origin = singleHeader(request.headers.origin);
  if (origin) return sameOrigin(origin, expectedOrigin);
  const referer = singleHeader(request.headers.referer);
  if (!referer) return false;
  try { return new URL(referer).origin === expectedOrigin; } catch { return false; }
}

export function sessionCookie(sessionId, idleTtlMs) {
  return `${CONTROL_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(idleTtlMs / 1000)}`;
}

export function clearSessionCookie() {
  return `${CONTROL_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

export function parseCookies(value) {
  const source = Array.isArray(value) ? value.join(";") : String(value ?? "");
  return Object.fromEntries(source.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return index < 0 ? [item, ""] : [item.slice(0, index), item.slice(index + 1)];
  }));
}

function matchingKey(map, candidate) {
  const candidateBytes = Buffer.from(candidate);
  for (const key of map.keys()) {
    const keyBytes = Buffer.from(key);
    if (keyBytes.length === candidateBytes.length && timingSafeEqual(keyBytes, candidateBytes)) return key;
  }
  return null;
}

function sameOrigin(value, expected) {
  try { return new URL(value).origin === expected; } catch { return false; }
}

function singleHeader(value) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function sessionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
