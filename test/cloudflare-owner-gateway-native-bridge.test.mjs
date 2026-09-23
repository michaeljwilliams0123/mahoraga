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

test("native bridge projects assistant.respond from the Cloudflare execution runtime binding", async () => {
  let calls = 0;
  const executionRuntime = {
    async fetch(request) {
      calls += 1;
      const url = new URL(request.url);
      assert.equal(url.pathname, "/api/capabilities");
      return new Response(JSON.stringify({
        capabilities: [{
          capability: "assistant.respond",
          routable: true,
          enabled: true,
          provider: "cloudflare-workers-ai",
          workerIds: [],
          routingReason: null,
          providerReasonCode: null,
          evidenceLevel: "runtime-probe",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };

  await withoutUpstream(async () => {
    const request = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "capabilities", payload: {} }),
    });
    const response = await gateway.fetch(request, { ...env, MAHORAGA_EXECUTION_RUNTIME: executionRuntime }, access);
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    const body = await response.json();
    assert.equal(body.capabilities[0].provider, "cloudflare-workers-ai");
    assert.equal(body.capabilities[0].routable, true);
    assert.equal(body.capabilities[0].enabled, true);
    assert.equal(body.capabilities[0].routingReason, null);
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

test("native chat and conversation reads use the execution service binding with owner assertion", async () => {
  const calls = [];
  const executionRuntime = { async fetch(request) {
    calls.push({ path: new URL(request.url).pathname, owner: request.headers.get("x-mahoraga-owner"), signature: request.headers.get("x-mahoraga-owner-signature"), body: await request.json() });
    return Response.json({ conversation: { id: "conversation-1" }, task: null, objective: null, decision: { mode: "ask" } });
  } };
  await withoutUpstream(async () => {
    for (const type of ["chat", "tasks", "messages", "message-content"]) {
      const response = await gateway.fetch(new Request(`${base}/api/runtime/pages-bridge/action`, {
        method: "POST", headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ type, payload: { conversationId: "conversation-1", content: "hello" } }),
      }), { ...env, MAHORAGA_EXECUTION_RUNTIME: executionRuntime }, access);
      assert.equal(response.status, 200);
    }
  });
  assert.deepEqual(calls.map((call) => call.body.type), ["chat", "tasks", "messages", "message-content"]);
  for (const call of calls) {
    assert.equal(call.path, "/api/native/bridge");
    assert.equal(call.owner, env.MAHORAGA_CLOUD_OWNER_ID);
    assert.match(call.signature, /^[a-f0-9]{64}$/);
  }
});
