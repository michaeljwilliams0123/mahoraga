import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { reserveCloudReplayNonce } from "./cloud-owner-gateway";

export const PAGES_BRIDGE_PROTOCOL_VERSION = 1 as const;
const BRIDGE_TTL_MS = 30 * 60 * 1000;
const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const SESSION_HEADER = "x-mahoraga-bridge-session";
const CSRF_HEADER = "x-mahoraga-bridge-csrf";
const FORBIDDEN_PAYLOAD_KEYS = new Set(["url", "authorization", "headers", "provider", "executable"]);

type BridgePayload = { ownerId: string; sessionId: string; protocolVersion: 1; expiresAt: number };
export type PagesBridgeSession = { token: string; csrf: string; expiresAt: number; protocolVersion: 1 };

export function validatePagesOrigin(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw bridgeError("cloud-pages-origin-invalid", 503); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw bridgeError("cloud-pages-origin-invalid", 503);
  }
  return parsed.origin;
}

export function issuePagesBridgeSession(ownerId: string, env: NodeJS.ProcessEnv = process.env): PagesBridgeSession {
  const secret = requiredSecret(env);
  const sessionId = `pbg-${randomUUID()}`;
  const expiresAt = Date.now() + BRIDGE_TTL_MS;
  const payload: BridgePayload = { ownerId, sessionId, protocolVersion: PAGES_BRIDGE_PROTOCOL_VERSION, expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(secret, encoded)}`;
  return { token, csrf: sign(secret, `pages-bridge-csrf:${sessionId}`), expiresAt, protocolVersion: PAGES_BRIDGE_PROTOCOL_VERSION };
}

export function authorizePagesBridgeMutation(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const secret = requiredSecret(env);
  const token = request.headers.get(SESSION_HEADER) ?? "";
  const session = verifySessionToken(token, secret);
  if (!session || session.expiresAt <= Date.now()) throw bridgeError("cloud-owner-auth-required", 401);
  const csrf = request.headers.get(CSRF_HEADER) ?? "";
  if (!safeEqual(csrf, sign(secret, `pages-bridge-csrf:${session.sessionId}`))) throw bridgeError("cloud-bridge-csrf-required", 403);
  const nonce = request.headers.get("x-mahoraga-request-nonce") ?? "";
  const timestamp = Number(request.headers.get("x-mahoraga-request-timestamp"));
  if (!/^[a-f0-9-]{36}$/i.test(nonce) || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    throw bridgeError("cloud-replay-envelope-invalid", 403);
  }
  reserveCloudReplayNonce(`bridge:${nonce}`, session.sessionId, timestamp + REPLAY_WINDOW_MS, "cloud-bridge-replay-detected", env);
  return { ownerId: session.ownerId, sessionId: session.sessionId };
}

export function assertPagesBridgeActionPayload(payload: Record<string, unknown>) {
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) throw bridgeError("cloud-bridge-payload-forbidden", 400);
  }
}

function verifySessionToken(token: string, secret: string): BridgePayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !safeEqual(signature, sign(secret, encoded))) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<BridgePayload>;
    return typeof value.ownerId === "string" && /^pbg-[a-f0-9-]{36}$/i.test(value.sessionId ?? "")
      && value.protocolVersion === PAGES_BRIDGE_PROTOCOL_VERSION && Number.isFinite(value.expiresAt)
      ? value as BridgePayload : null;
  } catch { return null; }
}
function requiredSecret(env: NodeJS.ProcessEnv) {
  const value = env.MAHORAGA_CLOUD_SESSION_SECRET?.trim();
  if (!value || value.length < 32) throw bridgeError("cloud-session-secret-invalid", 503);
  return value;
}
function sign(secret: string, value: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function bridgeError(code: string, status: number) { return Object.assign(new Error(code), { status }); }
