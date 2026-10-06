import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import gateway from "../deploy/cloudflare-owner-gateway/worker.mjs";

const env = {
  MAHORAGA_CLOUD_OWNER_ID: "owner@example.com",
  MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "x".repeat(64),
  MAHORAGA_RUNTIME_ORIGIN: "https://mahoraga-runtime-main-production.up.railway.app/",
  MAHORAGA_PAGES_ORIGIN: "https://michaeljwilliams0123.github.io",
};
const access = { access: { async getIdentity() { return { email: env.MAHORAGA_CLOUD_OWNER_ID }; } } };
const base = "https://mahoraga-owner-gateway.example";

test("internal activity reads and owner controls use only the signed execution binding", async () => {
  const calls = [];
  const runtime = { async fetch(request) {
    calls.push(await request.json());
    assert.equal(new URL(request.url).pathname, "/api/native/bridge");
    assert.match(request.headers.get("x-mahoraga-owner-signature"), /^[a-f0-9]{64}$/);
    return Response.json({ enabled: true });
  } };
  for (const [type, payload] of [["internal-activity", {}], ["internal-activity-control", { enabled: false }]]) {
    const response = await gateway.fetch(new Request(`${base}/api/runtime/pages-bridge/action`, {
      method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ type, payload }),
    }), { ...env, MAHORAGA_EXECUTION_RUNTIME: runtime }, access);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(calls, [{ type: "internal-activity", payload: {} }, { type: "internal-activity-control", payload: { enabled: false } }]);
});

test("readiness uses the fixed binding only behind exact owner and same-origin gates", async () => {
  let calls = 0;
  const binding = { async fetch(request) {
    calls++;
    assert.equal(request.url, "https://mahoraga-execution-runtime/api/ready");
    return Response.json({ status: "ready", sha: "a".repeat(40), durableState: "cloudflare-do-sqlite" });
  } };
  const request = (origin = base, payload = {}, extra = {}) => new Request(`${base}/api/runtime/pages-bridge/action`, {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ type: "readiness", payload, ...extra }),
  });
  const boundEnv = { ...env, MAHORAGA_EXECUTION_RUNTIME: binding };
  assert.equal((await gateway.fetch(request(), boundEnv, {})).status, 403);
  assert.equal((await gateway.fetch(request(), boundEnv, { access: { async getIdentity() { return { email: "other@example.com" }; } } })).status, 401);
  assert.equal((await gateway.fetch(request("https://attacker.example"), boundEnv, access)).status, 403);
  assert.equal((await gateway.fetch(request(base, { url: "https://attacker.example" }), boundEnv, access)).status, 400);
  assert.equal((await gateway.fetch(request(base, {}, { token: "private" }), boundEnv, access)).status, 400);
  assert.equal(calls, 0);
  const response = await gateway.fetch(request(), boundEnv, access);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sha, "a".repeat(40));
  assert.equal(calls, 1);
});

async function withoutUpstream(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("railway-proxy-must-not-run"); };
  try { return await callback(); }
  finally { globalThis.fetch = originalFetch; }
}

test("Access-authenticated browser navigation serves the workspace through the owner gateway", async () => {
  const requests = [];
  const workspace = { async fetch(request) {
    requests.push(request);
    return new Response("<!doctype html><title>Mahoraga</title>", { headers: { "content-type": "text/html" } });
  } };
  const response = await gateway.fetch(new Request(`${base}/#workspace`, { headers: { accept: "text/html,application/xhtml+xml" } }), { ...env, MAHORAGA_WORKSPACE: workspace }, access);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, "/");
});

test("Access-authenticated generated health asset is served through the workspace binding", async () => {
  const requests = [];
  const workspace = { async fetch(request) {
    requests.push(request);
    return Response.json({ status: "ok", sha: "a".repeat(40) });
  } };
  const response = await gateway.fetch(new Request(`${base}/api/health.json`), { ...env, MAHORAGA_WORKSPACE: workspace }, access);
  assert.equal(response.status, 200);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, "/api/health.json");
  assert.equal((await response.json()).sha, "a".repeat(40));
});

test("root and nested owner-gateway configs expose the same workspace binding", async () => {
  const [rootConfig, nestedConfig] = await Promise.all([
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8"),
  ]);
  for (const config of [rootConfig, nestedConfig]) {
    assert.match(config, /MAHORAGA_WORKSPACE_ORIGIN\s*=\s*"https:\/\/mahoraga-workspace-candidate\.mahoraga-mjw0123\.workers\.dev"/);
    assert.match(config, /binding\s*=\s*"MAHORAGA_WORKSPACE"[\s\S]*service\s*=\s*"mahoraga-workspace-candidate"/);
  }
});

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
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors https:\/\/michaeljwilliams0123\.github\.io https:\/\/mahoraga-owner-gateway\.example/);
    const html = await response.text();
    assert.match(html, /https:\/\/mahoraga-owner-gateway\.example/);
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
        }, {
          capability: "cognitive.predict", routable: true, enabled: true,
          provider: "mahoraga-cognitive-core", workerIds: ["cognitive-core"],
          costClass: "deterministic", routingReason: null, providerReasonCode: null,
          evidenceLevel: "runtime-execution",
        }, {
          capability: "cognitive.cycle", routable: true, enabled: true,
          provider: "mahoraga-cognitive-core", workerIds: ["cognitive-core"],
          costClass: "deterministic", routingReason: null, providerReasonCode: null,
          evidenceLevel: "runtime-execution",
        }, {
          capability: "repository.inspect", routable: true, enabled: true,
          provider: "github", workerIds: ["connector-github"],
          costClass: "deterministic", permissionClass: "read", routingReason: null, providerReasonCode: null,
          evidenceLevel: "runtime-execution",
        }, {
          capability: "cloud.inspect", routable: true, enabled: true,
          provider: "cloudflare", workerIds: ["connector-cloudflare"],
          costClass: "deterministic", permissionClass: "read", routingReason: null, providerReasonCode: null,
          evidenceLevel: "runtime-execution",
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
    assert.deepEqual(body.capabilities.slice(1).map((item) => item.capability), ["cognitive.predict", "cognitive.cycle", "repository.inspect", "cloud.inspect"]);
    assert.ok(body.capabilities.slice(1).every((item) => item.costClass === "deterministic" && item.evidenceLevel === "runtime-execution"));
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

test("unknown gateway routes fail closed locally and never proxy Railway", async () => {
  await withoutUpstream(async () => {
    const response = await gateway.fetch(new Request(`${base}/api/legacy-or-unmigrated`), env, access);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "cloud-native-route-required" });
  });
});
