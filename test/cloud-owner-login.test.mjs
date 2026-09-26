import test from "node:test";
import assert from "node:assert/strict";
import { hasTrustedRequestOrigin, hashOwnerLoginPin, verifyOwnerLoginPin } from "../cloud-app/lib/owner-login.ts";

const secret = "6f0a97a7af4a4bd69b9af4ed6e5d3a50";
const pin = "4782";
const pinHash = hashOwnerLoginPin(pin, secret);
const railwayDomain = "mahoraga-runtime-main-production.up.railway.app";

test("owner login accepts only the configured four-digit PIN", () => {
  const env = { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: secret, MAHORAGA_CLOUD_OWNER_PIN_HASH: pinHash };
  assert.deepEqual(verifyOwnerLoginPin(pin, env), { ok: true });
  assert.deepEqual(verifyOwnerLoginPin("4783", env), { ok: false, code: "cloud-owner-login-required" });
  assert.deepEqual(verifyOwnerLoginPin("12345", env), { ok: false, code: "cloud-owner-login-required" });
});

test("owner PIN fails closed for weak or malformed server configuration", () => {
  assert.deepEqual(verifyOwnerLoginPin(pin, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: "too-short", MAHORAGA_CLOUD_OWNER_PIN_HASH: pinHash }), { ok: false, code: "cloud-owner-login-secret-invalid" });
  assert.deepEqual(verifyOwnerLoginPin(pin, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: secret, MAHORAGA_CLOUD_OWNER_PIN_HASH: "not-a-hash" }), { ok: false, code: "cloud-owner-login-secret-invalid" });
});

test("owner PIN fails closed when server-side authentication material is absent", () => {
  assert.deepEqual(verifyOwnerLoginPin(pin, {}), { ok: false, code: "cloud-owner-login-not-configured" });
});

test("owner login rejects Railway environment grants and accepts only request same-origin", () => {
  const env = { RAILWAY_PUBLIC_DOMAIN: railwayDomain };
  const publicRequest = new Request("http://0.0.0.0:3000/api/runtime/login", { headers: { origin: `https://${railwayDomain}` } });
  const sameOriginRequest = new Request("https://owner-gateway.example/api/runtime/login", { headers: { origin: "https://owner-gateway.example" } });
  const foreignRequest = new Request("http://0.0.0.0:3000/api/runtime/login", { headers: { origin: "https://evil.example" } });
  assert.equal(hasTrustedRequestOrigin(publicRequest, env), false);
  assert.equal(hasTrustedRequestOrigin(sameOriginRequest, env), true);
  assert.equal(hasTrustedRequestOrigin(foreignRequest, env), false);
});
