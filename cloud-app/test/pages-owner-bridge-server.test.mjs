import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PAGES_BRIDGE_PROTOCOL_VERSION,
  authorizePagesBridgeMutation,
  issuePagesBridgeSession,
  validatePagesOrigin,
} from "../lib/pages-owner-bridge.ts";
import { ALLOWED_CLOUD_RUNTIME_ACTIONS } from "../lib/cloud-runtime-action.ts";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

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

test("Pages bridge exposes only an HTTPS origin-only protocol and the existing bounded action set", () => {
  assert.equal(PAGES_BRIDGE_PROTOCOL_VERSION, 1);
  assert.equal(validatePagesOrigin("https://michaeljwilliams0123.github.io"), "https://michaeljwilliams0123.github.io");
  assert.throws(() => validatePagesOrigin("http://michaeljwilliams0123.github.io"));
  assert.throws(() => validatePagesOrigin("https://michaeljwilliams0123.github.io/path"));
  assert.throws(() => validatePagesOrigin("https://user:pass@michaeljwilliams0123.github.io"));
  assert.equal(ALLOWED_CLOUD_RUNTIME_ACTIONS.has("chat"), true);
  assert.equal(ALLOWED_CLOUD_RUNTIME_ACTIONS.has("operations-action"), true);
  assert.equal(ALLOWED_CLOUD_RUNTIME_ACTIONS.has("arbitrary-http"), false);
});

test("bridge sessions reject missing proof, tampering, stale timestamps, expiry, and nonce replay", async () => {
  const replayRoot = await mkdtemp(path.join(os.tmpdir(), "mahoraga-pages-bridge-"));
  const env = {
    MAHORAGA_CLOUD_SESSION_SECRET: "s".repeat(48),
    MAHORAGA_PAGES_BRIDGE_REPLAY_ROOT: replayRoot,
  };
  try {
    const session = issuePagesBridgeSession("owner-test", env);
    assert.equal(session.protocolVersion, 1);
    assert.ok(session.expiresAt > Date.now());

    assert.throws(() => authorizePagesBridgeMutation(bridgeRequest(session, { csrf: "wrong" }), env), /cloud-bridge-csrf-required/);
    assert.throws(() => authorizePagesBridgeMutation(bridgeRequest(session, { token: `${session.token}x` }), env), /cloud-owner-auth-required/);
    assert.throws(() => authorizePagesBridgeMutation(bridgeRequest(session, { timestamp: 1 }), env), /cloud-replay-envelope-invalid/);

    const nonce = crypto.randomUUID();
    const authorized = authorizePagesBridgeMutation(bridgeRequest(session, { nonce }), env);
    assert.equal(authorized.ownerId, "owner-test");
    assert.match(authorized.sessionId, /^pbg-[a-f0-9-]{36}$/i);
    assert.throws(() => authorizePagesBridgeMutation(bridgeRequest(session, { nonce }), env), /cloud-bridge-replay-detected/);

    const originalNow = Date.now;
    try {
      Date.now = () => session.expiresAt + 1;
      assert.throws(() => authorizePagesBridgeMutation(bridgeRequest(session, { nonce: crypto.randomUUID(), timestamp: Date.now() }), env), /cloud-owner-auth-required/);
    } finally {
      Date.now = originalNow;
    }
  } finally {
    await rm(replayRoot, { recursive: true, force: true });
  }
});

test("bridge routes remain no-store, bounded, and reject authority-expanding payload keys", async () => {
  const [login, action, artifacts, cookieLogin] = await Promise.all([
    read("app/api/runtime/pages-bridge/login/route.ts"),
    read("app/api/runtime/pages-bridge/action/route.ts"),
    read("app/api/runtime/pages-bridge/artifacts/route.ts"),
    read("app/api/runtime/login/route.ts"),
  ]);

  assert.match(login, /verifyOwnerLoginAttempt/);
  assert.match(login, /issuePagesBridgeSession/);
  assert.match(login, /cache-control.*no-store/i);
  assert.doesNotMatch(login, /set-cookie/i);

  assert.match(action, /authorizePagesBridgeMutation/);
  assert.match(action, /dispatchCloudRuntimeAction/);
  for (const forbidden of ["url", "authorization", "headers", "provider", "executable"]) {
    assert.match(action, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(action, /cache-control.*no-store/i);

  assert.match(artifacts, /authorizePagesBridgeMutation/);
  assert.match(artifacts, /MAX_FILE_BYTES/);
  assert.match(artifacts, /coreArtifactRequest/);
  assert.match(artifacts, /cache-control.*no-store/i);

  assert.match(cookieLogin, /set-cookie/);
  assert.match(cookieLogin, /establishOwnerLoginSession/);
});
