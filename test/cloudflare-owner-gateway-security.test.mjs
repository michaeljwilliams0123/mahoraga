import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../deploy/cloudflare-owner-gateway/worker.mjs";

const baseEnv = {
  MAHORAGA_CLOUD_OWNER_ID: "owner@example.com",
  MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "x".repeat(64),
};
const request = (headers = {}) => new Request("https://mahoraga-owner-gateway.example/api/runtime/session?probe=1", { headers });
const access = (email) => ({ access: { async getIdentity() { return { email }; } } });

test("caller cannot spoof Access identity with a request header", async () => {
  const response = await gateway.fetch(request({ "cf-access-authenticated-user-email": baseEnv.MAHORAGA_CLOUD_OWNER_ID }), baseEnv, {});
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "owner-access-required");
});

test("authenticated Access identity must match the pinned owner", async () => {
  const response = await gateway.fetch(request(), baseEnv, access("other@example.com"));
  assert.equal(response.status, 401);
  assert.equal(await response.text(), "owner-auth-required");
});

test("gateway fails closed when the HMAC secret is unavailable", async () => {
  const env = { ...baseEnv, MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "" };
  const response = await gateway.fetch(request(), env, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "gateway-environment-invalid");
});

test("authenticated unknown routes fail closed without an external request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("external-request-must-not-run"); };
  try {
    const response = await gateway.fetch(request(), baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "cloud-native-route-required" });
  } finally { globalThis.fetch = originalFetch; }
});

test("gateway rejects cross-origin mutation requests before native routing", async () => {
  let serviceCalls = 0;
  const env = {
    ...baseEnv,
    MAHORAGA_EXECUTION_RUNTIME: {
      async fetch() { serviceCalls += 1; return Response.json({ ok: true }); },
    },
  };
  const mutation = new Request("https://mahoraga-owner-gateway.example/api/runtime/pages-bridge/action", {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ type: "chat", payload: { content: "hello" } }),
  });
  const response = await gateway.fetch(mutation, env, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "gateway-same-origin-required");
  assert.equal(serviceCalls, 0);
});

test("same-origin unknown mutations fail closed instead of leaving Cloudflare", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("external-request-must-not-run"); };
  try {
    const mutation = new Request("https://mahoraga-owner-gateway.example/api/runtime/action", {
      method: "POST",
      headers: { origin: "https://mahoraga-owner-gateway.example" },
    });
    const response = await gateway.fetch(mutation, baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "cloud-native-route-required" });
  } finally { globalThis.fetch = originalFetch; }
});
