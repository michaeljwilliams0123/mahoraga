import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../deploy/cloudflare-owner-gateway/worker.mjs";

const baseEnv = {
  MAHORAGA_CLOUD_OWNER_ID: "owner@example.com",
  MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "x".repeat(64),
  MAHORAGA_RUNTIME_ORIGIN: "https://mahoraga-runtime-main-production.up.railway.app/",
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

test("malformed upstream origin is rejected before proxying", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("proxy-must-not-run"); };
  try {
    const env = { ...baseEnv, MAHORAGA_RUNTIME_ORIGIN: "http://user:pass@example.com/path" };
    const response = await gateway.fetch(request(), env, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "gateway-origin-invalid");
  } finally { globalThis.fetch = originalFetch; }
});

test("valid Access identity gets a fresh assertion and caller assertions are replaced", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (next) => { forwarded = next; return new Response("ok", { status: 200 }); };
  try {
    const response = await gateway.fetch(request({
      "x-mahoraga-owner": "forged@example.com",
      "x-mahoraga-owner-timestamp": "1",
      "x-mahoraga-owner-nonce": "forged",
      "x-mahoraga-owner-signature": "forged",
    }), baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://mahoraga-runtime-main-production.up.railway.app/api/runtime/session?probe=1");
    assert.equal(forwarded.headers.get("x-mahoraga-owner"), baseEnv.MAHORAGA_CLOUD_OWNER_ID);
    assert.notEqual(forwarded.headers.get("x-mahoraga-owner-nonce"), "forged");
    assert.notEqual(forwarded.headers.get("x-mahoraga-owner-signature"), "forged");
    assert.equal(forwarded.redirect, "manual");
  } finally { globalThis.fetch = originalFetch; }
});


test("gateway rejects cross-origin mutation requests before proxying", async () => {
  const originalFetch = globalThis.fetch;
  let proxied = false;
  globalThis.fetch = async () => { proxied = true; return new Response("ok", { status: 200 }); };
  try {
    const mutation = new Request("https://mahoraga-owner-gateway.example/api/runtime/action", {
      method: "POST", headers: { origin: "https://evil.example" },
    });
    const response = await gateway.fetch(mutation, baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "gateway-same-origin-required");
    assert.equal(proxied, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("gateway rewrites trusted mutation origin to the canonical upstream origin", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (next) => { forwarded = next; return new Response("ok", { status: 200 }); };
  try {
    const mutation = new Request("https://mahoraga-owner-gateway.example/api/runtime/action", {
      method: "POST", headers: { origin: "https://mahoraga-owner-gateway.example" },
    });
    const response = await gateway.fetch(mutation, baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 200);
    assert.equal(forwarded.headers.get("origin"), "https://mahoraga-runtime-main-production.up.railway.app");
  } finally { globalThis.fetch = originalFetch; }
});
