import test from "node:test";
import assert from "node:assert/strict";
import { verifyOwnerLoginSecret } from "../cloud-app/lib/owner-login.ts";
import { hasTrustedRequestOrigin } from "../cloud-app/lib/cloud-owner-gateway.ts";

const configured = "6f0a97a7af4a4bd69b9af4ed6e5d3a50";
const shortestAccepted = "1234567890abcdef";
const railwayDomain = "mahoraga-runtime-main-production.up.railway.app";

test("owner login accepts only the configured high-entropy secret", () => {
  assert.deepEqual(verifyOwnerLoginSecret(configured, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: configured }), { ok: true });
  assert.deepEqual(verifyOwnerLoginSecret(`${configured}x`, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: configured }), { ok: false, code: "cloud-owner-login-required" });
});

test("owner login accepts a 16-character secret and rejects shorter configuration", () => {
  assert.deepEqual(verifyOwnerLoginSecret(shortestAccepted, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: shortestAccepted }), { ok: true });
  assert.deepEqual(verifyOwnerLoginSecret(shortestAccepted, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: "123456789012345" }), { ok: false, code: "cloud-owner-login-secret-invalid" });
});

test("owner login fails closed when its server-side secret is absent", () => {
  assert.deepEqual(verifyOwnerLoginSecret(configured, {}), { ok: false, code: "cloud-owner-login-not-configured" });
});

test("owner login accepts only the configured Railway public origin behind the proxy", () => {
  const env = { RAILWAY_PUBLIC_DOMAIN: railwayDomain };
  const publicRequest = new Request("http://0.0.0.0:3000/api/runtime/login", { headers: { origin: `https://${railwayDomain}` } });
  const foreignRequest = new Request("http://0.0.0.0:3000/api/runtime/login", { headers: { origin: "https://evil.example" } });
  assert.equal(hasTrustedRequestOrigin(publicRequest, env), true);
  assert.equal(hasTrustedRequestOrigin(foreignRequest, env), false);
});
