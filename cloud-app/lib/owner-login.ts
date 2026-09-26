import { createHmac, timingSafeEqual } from "node:crypto";

type LoginResult = { ok: true } | { ok: false; code: "cloud-owner-login-not-configured" | "cloud-owner-login-secret-invalid" | "cloud-owner-login-required" };
export type OwnerLoginAttemptState = { failures: number; windowStartedAt: number; lockedUntil: number };

const MINIMUM_SECRET_LENGTH = 32;
const MAXIMUM_SECRET_LENGTH = 256;
const PIN_PATTERN = /^\d{4}$/;
const PIN_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const OWNER_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const OWNER_LOGIN_LOCK_MS = 15 * 60 * 1000;

export function hasTrustedRequestOrigin(request: Request, env: NodeJS.ProcessEnv = process.env) {
  void env;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let receivedOrigin: string;
  try { receivedOrigin = new URL(origin).origin; } catch { return false; }

  const allowedOrigins = new Set<string>();
  try { allowedOrigins.add(new URL(request.url).origin); } catch { /* malformed internal URL is not trusted */ }
  return allowedOrigins.has(receivedOrigin);
}

export function hashOwnerLoginPin(pin: string, secret: string) {
  return createHmac("sha256", secret).update(`mahoraga-owner-pin:${pin}`).digest("hex");
}

export function verifyOwnerLoginPin(supplied: unknown, env: NodeJS.ProcessEnv = process.env): LoginResult {
  const secret = env.MAHORAGA_CLOUD_OWNER_LOGIN_SECRET?.trim();
  const configuredHash = env.MAHORAGA_CLOUD_OWNER_PIN_HASH?.trim();
  if (!secret || !configuredHash) return { ok: false, code: "cloud-owner-login-not-configured" };
  if (secret.length < MINIMUM_SECRET_LENGTH || secret.length > MAXIMUM_SECRET_LENGTH || !PIN_HASH_PATTERN.test(configuredHash)) {
    return { ok: false, code: "cloud-owner-login-secret-invalid" };
  }
  if (typeof supplied !== "string" || !PIN_PATTERN.test(supplied)) return { ok: false, code: "cloud-owner-login-required" };
  const candidate = hashOwnerLoginPin(supplied, secret);
  const suppliedBytes = Buffer.from(candidate, "hex");
  const configuredBytes = Buffer.from(configuredHash, "hex");
  return suppliedBytes.length === configuredBytes.length && timingSafeEqual(suppliedBytes, configuredBytes)
    ? { ok: true }
    : { ok: false, code: "cloud-owner-login-required" };
}

export function nextOwnerLoginFailure(state: OwnerLoginAttemptState | null, now = Date.now(), maxFailures = 5): OwnerLoginAttemptState {
  const threshold = Math.max(1, Math.floor(maxFailures));
  if (state?.lockedUntil && state.lockedUntil > now) return state;
  if (!state || now - state.windowStartedAt >= OWNER_LOGIN_WINDOW_MS || state.lockedUntil > 0) {
    return { failures: 1, windowStartedAt: now, lockedUntil: threshold === 1 ? now + OWNER_LOGIN_LOCK_MS : 0 };
  }
  const failures = state.failures + 1;
  return { failures, windowStartedAt: state.windowStartedAt, lockedUntil: failures >= threshold ? now + OWNER_LOGIN_LOCK_MS : 0 };
}

export function ownerLoginRetryAfter(state: OwnerLoginAttemptState | null, now = Date.now()) {
  if (!state || state.lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
}
