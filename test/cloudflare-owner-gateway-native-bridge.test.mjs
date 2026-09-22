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

function cloudExecutionBinding(handler) {
  return { fetch: handler };
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

test("native bridge keeps assistant.respond fail-closed when Cloudflare cognition is not ready", async () => {
  await withoutUpstream(async () => {
    const boundEnv = {
      ...env,
      EXECUTION_RUNTIME: cloudExecutionBinding(async () => new Response(JSON.stringify({ ready: false, reasonCode: "zero-credit-provider-unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })),
    };
    const request = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "capabilities", payload: {} }),
    });
    const response = await gateway.fetch(request, boundEnv, access);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.capabilities[0].capability, "assistant.respond");
    assert.equal(body.capabilities[0].routable, false);
    assert.equal(body.capabilities[0].enabled, false);
  });
});

test("native bridge advertises and executes assistant.respond through the bound Cloudflare runtime without Railway", async () => {
  await withoutUpstream(async () => {
    const observed = [];
    const boundEnv = {
      ...env,
      EXECUTION_RUNTIME: cloudExecutionBinding(async (request) => {
        const url = new URL(request.url);
        observed.push({ path: url.pathname, method: request.method, body: request.method === "POST" ? await request.clone().json() : null });
        if (url.pathname === "/api/assistant/ready") {
          return new Response(JSON.stringify({ ready: true, capability: "assistant.respond", provider: "zero-credit-openai-compatible", sha: "16ce13354a73479eeabd1f1b3d4e9c2615e4daf6" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/api/assistant/respond") {
          return new Response(JSON.stringify({
            conversation: { id: "conv-cloudflare-1" },
            task: { id: "task-cloudflare-1", conversationId: "conv-cloudflare-1", status: "completed", capability: "assistant.respond", errorCode: null },
            objective: null,
            decision: { mode: "ask", execution: "completed" },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: "unexpected-path" }), { status: 404, headers: { "content-type": "application/json" } });
      }),
    };

    const capabilitiesRequest = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "capabilities", payload: {} }),
    });
    const capabilitiesResponse = await gateway.fetch(capabilitiesRequest, boundEnv, access);
    assert.equal(capabilitiesResponse.status, 200);
    const capabilities = await capabilitiesResponse.json();
    assert.equal(capabilities.capabilities[0].routable, true);
    assert.equal(capabilities.capabilities[0].enabled, true);
    assert.equal(capabilities.capabilities[0].provider, "zero-credit-openai-compatible");

    const chatRequest = new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ type: "chat", payload: { conversationId: null, content: "hello Mahoraga", mode: "auto", creditPolicy: "zero-codex", attachmentIds: [], idempotencyKey: "workspace-chat-1" } }),
    });
    const chatResponse = await gateway.fetch(chatRequest, boundEnv, access);
    assert.equal(chatResponse.status, 200);
    assert.deepEqual(await chatResponse.json(), {
      conversation: { id: "conv-cloudflare-1" },
      task: { id: "task-cloudflare-1", conversationId: "conv-cloudflare-1", status: "completed", capability: "assistant.respond", errorCode: null },
      objective: null,
      decision: { mode: "ask", execution: "completed" },
    });
    assert.deepEqual(observed.map((entry) => entry.path), ["/api/assistant/ready", "/api/assistant/respond"]);
    assert.equal(observed[1].body.content, "hello Mahoraga");
    assert.equal(observed[1].body.creditPolicy, "zero-codex");
  });
});
