import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../deploy/cloudflare-owner-gateway/worker.mjs";

const env = {
  MAHORAGA_CLOUD_OWNER_ID: "owner@example.com",
  MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "x".repeat(64),
  MAHORAGA_RUNTIME_ORIGIN: "https://mahoraga-runtime-main-production.up.railway.app/",
  MAHORAGA_PAGES_ORIGIN: "https://michaeljwilliams0123.github.io",
};
const access = { access: { async getIdentity() { return { email: env.MAHORAGA_CLOUD_OWNER_ID }; } } };
const base = "https://mahoraga-owner-gateway.example";

async function withoutUpstream(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("railway-proxy-must-not-run"); };
  try { return await callback(); }
  finally { globalThis.fetch = originalFetch; }
}

test("Access-authenticated root reports the Cloudflare edge without proxying Railway", async () => {
  await withoutUpstream(async () => {
    const response = await gateway.fetch(new Request(`${base}/`), env, access);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      gateway: "mahoraga-owner-gateway",
      ownerAuthenticated: true,
      runtime: "cloudflare-native-migration",
      state: "degraded",
    });
  });
});
test("Pages bridge frame is served natively and never touches Railway", async () => {
  await withoutUpstream(async () => {
    const response = await gateway.fetch(new Request(`${base}/api/runtime/pages-bridge/frame`), env, access);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors https:\/\/michaeljwilliams0123\.github\.io/);
    const html = await response.text();
    assert.match(html, /bridge\.status/);
    assert.match(html, /authenticated: true/);
    assert.match(html, /api\/runtime\/pages-bridge\/action/);
  });
});

test("native bridge advertises assistant.respond as unavailable instead of inventing a brain", async () => {
  await withoutUpstream(async () => {
    const request = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "capabilities", payload: {} }),
    });
    const response = await gateway.fetch(request, env, access);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.capabilities[0].capability, "assistant.respond");
    assert.equal(body.capabilities[0].routable, false);
    assert.equal(body.capabilities[0].enabled, false);
    assert.match(body.capabilities[0].routingReason, /provider/i);
  });
});
test("native bridge rejects unavailable chat without falling through to Railway", async () => {
  await withoutUpstream(async () => {
    const request = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "chat", payload: { text: "hello" } }),
    });
    const response = await gateway.fetch(request, env, access);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "cloud-native-capability-unavailable" });
  });
});
