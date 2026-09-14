import { timingSafeEqual } from "node:crypto";

type LoginResult = { ok: true } | { ok: false; code: "cloud-owner-login-not-configured" | "cloud-owner-login-secret-invalid" | "cloud-owner-login-required" };

const MINIMUM_SECRET_LENGTH = 16;
const MAXIMUM_SECRET_LENGTH = 256;

export function verifyOwnerLoginSecret(supplied: unknown, env: NodeJS.ProcessEnv = process.env): LoginResult {
  const configured = env.MAHORAGA_CLOUD_OWNER_LOGIN_SECRET?.trim();
  if (!configured) return { ok: false, code: "cloud-owner-login-not-configured" };
  if (configured.length < MINIMUM_SECRET_LENGTH || configured.length > MAXIMUM_SECRET_LENGTH) return { ok: false, code: "cloud-owner-login-secret-invalid" };
  if (typeof supplied !== "string" || supplied.length < MINIMUM_SECRET_LENGTH || supplied.length > MAXIMUM_SECRET_LENGTH) return { ok: false, code: "cloud-owner-login-required" };
  const suppliedBytes = Buffer.from(supplied);
  const configuredBytes = Buffer.from(configured);
  return suppliedBytes.length === configuredBytes.length && timingSafeEqual(suppliedBytes, configuredBytes)
    ? { ok: true }
    : { ok: false, code: "cloud-owner-login-required" };
}
