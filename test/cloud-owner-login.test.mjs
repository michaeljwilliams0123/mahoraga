import test from "node:test";
import assert from "node:assert/strict";
import { verifyOwnerLoginSecret } from "../cloud-app/lib/owner-login.ts";

const configured = "6f0a97a7af4a4bd69b9af4ed6e5d3a50";

test("owner login accepts only the configured high-entropy secret", () => {
  assert.deepEqual(verifyOwnerLoginSecret(configured, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: configured }), { ok: true });
  assert.deepEqual(verifyOwnerLoginSecret(`${configured}x`, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: configured }), { ok: false, code: "cloud-owner-login-required" });
});

test("owner login fails closed when its server-side secret is absent or too short", () => {
  assert.deepEqual(verifyOwnerLoginSecret(configured, {}), { ok: false, code: "cloud-owner-login-not-configured" });
  assert.deepEqual(verifyOwnerLoginSecret(configured, { MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: "short" }), { ok: false, code: "cloud-owner-login-secret-invalid" });
});
