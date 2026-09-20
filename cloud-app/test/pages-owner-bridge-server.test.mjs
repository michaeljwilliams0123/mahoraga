import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

async function importBridgeModule() {
  const source = await read("lib/pages-owner-bridge.ts");
  const stub = `const seen = new Set();\nexport function reserveCloudReplayNonce(nonce, sessionId, expiresAt, replayCode) { if (seen.has(nonce)) throw Object.assign(new Error(replayCode), { status: 409 }); seen.add(nonce); }`;
  const stubUrl = `data:text/javascript,${encodeURIComponent(stub)}`;
  const isolated = stripTypeScriptTypes(source.replace('"./cloud-owner-gateway"', JSON.stringify(stubUrl)));
  return import(`data:text/javascript,${encodeURIComponent(isolated)}`);
}

async function importActionModule() {
  const source = await read("lib/cloud-runtime-action.ts");
  const stub = `export async function coreRequest(type, payload) { return new Response(JSON.stringify({ type, payload }), { status: 200, headers: { 'content-type': 'application/json' } }); }`;
  const stubUrl = `data:text/javascript,${encodeURIComponent(stub)}`;
  const isolated = stripTypeScriptTypes(source.replace('"./cloud-owner-gateway"', JSON.stringify(stubUrl)));
  return import(`data:text/javascript,${encodeURIComponent(isolated)}`);
}

function bridgeRequest(session, { nonce = crypto.randomUUID(), timestamp = Date.now(), csrf = session.csrf, token = session.token } = {}) {
  return new Request("https://mahoraga-runtime-main-production.up.railway.app/api/runtime/pages-bridge/action", {
    method: "POST",
    headers: {
      "x-mahoraga-bridge-session": token,
      "x-mahoraga-bridge-csrf": csrf,
      "x-mahoraga-request-nonce": nonce,
      "x-mahoraga-request-timestamp": String(timestamp),
    },
  });
}

test("Pages bridge exposes only an HTTPS origin-only protocol and the existing bounded action set", async () => {
  const bridge = await importBridgeModule();
  const actions = await importActionModule();
  assert.equal(bridge.PAGES_BRIDGE_PROTOCOL_VERSION, 1);
  assert.equal(bridge.validatePagesOrigin("https://michaeljwilliams0123.github.io"), "https://michaeljwilliams0123.github.io");
  assert.throws(() => bridge.validatePagesOrigin("http://michaeljwilliams0123.github.io"));
  assert.throws(() => bridge.validatePagesOrigin("https://michaeljwilliams0123.github.io/path"));
  assert.throws(() => bridge.validatePagesOrigin(["https://user:pass", "@michaeljwilliams0123.github.io"].join("")));
  assert.equal(actions.ALLOWED_CLOUD_RUNTIME_ACTIONS.has("chat"), true);
  assert.equal(actions.ALLOWED_CLOUD_RUNTIME_ACTIONS.has("operations-action"), true);
  assert.equal(actions.ALLOWED_CLOUD_RUNTIME_ACTIONS.has("arbitrary-http"), false);
  await assert.rejects(() => actions.dispatchCloudRuntimeAction("arbitrary-http", {}), /cloud-action-not-allowed/);
});

test("bridge sessions reject missing proof, tampering, stale timestamps, expiry, and nonce replay", async () => {
  const bridge = await importBridgeModule();
  const env = { MAHORAGA_CLOUD_SESSION_SECRET: "s".repeat(48) };
  const session = bridge.issuePagesBridgeSession("owner-test", env);
  assert.equal(session.protocolVersion, 1);
  assert.ok(session.expiresAt > Date.now());

  assert.throws(() => bridge.authorizePagesBridgeMutation(bridgeRequest(session, { csrf: "wrong" }), env), /cloud-bridge-csrf-required/);
  assert.throws(() => bridge.authorizePagesBridgeMutation(bridgeRequest(session, { token: `${session.token}x` }), env), /cloud-owner-auth-required/);
  assert.throws(() => bridge.authorizePagesBridgeMutation(bridgeRequest(session, { timestamp: 1 }), env), /cloud-replay-envelope-invalid/);

  const nonce = crypto.randomUUID();
  const authorized = bridge.authorizePagesBridgeMutation(bridgeRequest(session, { nonce }), env);
  assert.equal(authorized.ownerId, "owner-test");
  assert.match(authorized.sessionId, /^pbg-[a-f0-9-]{36}$/i);
  assert.throws(() => bridge.authorizePagesBridgeMutation(bridgeRequest(session, { nonce }), env), /cloud-bridge-replay-detected/);

  const originalNow = Date.now;
  try {
    Date.now = () => session.expiresAt + 1;
    assert.throws(() => bridge.authorizePagesBridgeMutation(bridgeRequest(session, { nonce: crypto.randomUUID(), timestamp: Date.now() }), env), /cloud-owner-auth-required/);
  } finally {
    Date.now = originalNow;
  }
});

test("bridge uses the existing durable replay store and preserves the normal cookie login", async () => {
  const [gateway, cookieLogin] = await Promise.all([
    read("lib/cloud-owner-gateway.ts"),
    read("app/api/runtime/login/route.ts"),
  ]);
  assert.match(gateway, /export function reserveCloudReplayNonce/);
  assert.match(gateway, /DatabaseSync/);
  assert.match(gateway, /MAHORAGA_PAGES_BRIDGE_REPLAY_ROOT/);
  assert.match(gateway, /export function verifyOwnerLoginAttempt/);
  assert.match(cookieLogin, /set-cookie/);
  assert.match(cookieLogin, /establishOwnerLoginSession/);
});

test("bridge routes remain no-store, bounded, and reject authority-expanding payload keys", async () => {
  const [login, action, artifacts] = await Promise.all([
    read("app/api/runtime/pages-bridge/login/route.ts"),
    read("app/api/runtime/pages-bridge/action/route.ts"),
    read("app/api/runtime/pages-bridge/artifacts/route.ts"),
  ]);

  assert.match(login, /verifyOwnerLoginAttempt/);
  assert.match(login, /issuePagesBridgeSession/);
  assert.match(login, /cache-control.*no-store/i);
  assert.doesNotMatch(login, /set-cookie/i);

  assert.match(action, /authorizePagesBridgeMutation/);
  assert.match(action, /dispatchCloudRuntimeAction/);
  for (const forbidden of ["url", "authorization", "headers", "provider", "executable"]) {
    assert.match(await read("lib/pages-owner-bridge.ts"), new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(action, /cache-control.*no-store/i);

  assert.match(artifacts, /authorizePagesBridgeMutation/);
  assert.match(artifacts, /MAX_FILE_BYTES/);
  assert.match(artifacts, /coreArtifactRequest/);
  assert.match(artifacts, /cache-control.*no-store/i);
});
