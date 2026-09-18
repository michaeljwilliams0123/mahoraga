import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("the direct Railway owner PIN login mints only a server-side session cookie", async () => {
  const [route, gateway, login] = await Promise.all([
    read("app/api/runtime/login/route.ts"),
    read("lib/cloud-owner-gateway.ts"),
    read("lib/owner-login.ts"),
  ]);

  assert.match(route, /establishOwnerLoginSession/);
  assert.match(route, /set-cookie/);
  assert.match(gateway, /verifyOwnerLoginPin/);
  assert.match(login, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET/);
  assert.match(login, /MAHORAGA_CLOUD_OWNER_PIN_HASH/);
  assert.match(gateway, /cloud-owner-login-required/);
  assert.doesNotMatch(route, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET|MAHORAGA_CLOUD_SESSION_SECRET|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("the Railway workspace offers a same-origin owner sign-in without exposing the secret", async () => {
  const [workspace, chat, types, relay] = await Promise.all([
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
    read("components/workspace/workspace-types.ts"),
    read("lib/runtime-relay.ts"),
  ]);

  assert.match(workspace, /loginDirectOwner/);
  assert.match(workspace, /\/api\/runtime\/login/);
  assert.match(workspace, /body: JSON\.stringify\(\{ ownerPin: ownerLoginPin \}\)/);
  assert.match(chat, /Sign in to Mahoraga/);
  assert.match(chat, /ownerLoginPin/);
  assert.match(chat, /inputMode="numeric"/);
  assert.match(chat, /maxLength=\{4\}/);
  assert.match(types, /onOwnerLogin/);
  assert.match(relay, /cloud-owner-auth-required/);
  assert.doesNotMatch(`${workspace}\n${chat}\n${types}`, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET/);
});

test("owner login responses prevent caching for successful and failed authentication", async () => {
  const source = await read("app/api/runtime/login/route.ts");
  const gateway = `export function establishOwnerLoginSession(request, supplied) {
    if (supplied === "valid") return { cookie: "owner-session=test; HttpOnly; Secure; SameSite=Strict" };
    const error = new Error(supplied === "unconfigured" ? "cloud-gateway-not-configured" : supplied === "locked" ? "cloud-owner-login-rate-limited" : "cloud-owner-login-required");
    error.status = supplied === "unconfigured" ? 503 : supplied === "locked" ? 429 : 401;
    if (supplied === "locked") error.retryAfterSeconds = 900;
    throw error;
  }
  export function gatewayFailure(error) { return { code: error.message, status: error.status, retryAfterSeconds: error.retryAfterSeconds ?? 0 }; }`;
  const gatewayUrl = `data:text/javascript,${encodeURIComponent(gateway)}`;
  const importPath = '"@/lib/cloud-owner-gateway"';
  assert.equal(source.split(importPath).length, 2, "the test must replace the gateway import exactly once");
  const isolated = stripTypeScriptTypes(source.replace(importPath, JSON.stringify(gatewayUrl)));
  const { POST } = await import(`data:text/javascript,${encodeURIComponent(isolated)}`);

  for (const [ownerPin, status] of [["valid", 200], ["invalid", 401], ["unconfigured", 503], ["locked", 429]]) {
    const response = await POST(new Request("https://example.test/api/runtime/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerPin }),
    }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.has("set-cookie"), status === 200);
    assert.equal(response.headers.get("retry-after"), status === 429 ? "900" : null);
    assert.equal((await response.json()).authenticated, status === 200);
  }
});


test("owner PIN verification uses exactly four digits plus a strong server-side pepper", async () => {
  const source = stripTypeScriptTypes(await read("lib/owner-login.ts"));
  const auth = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const secret = "p".repeat(48);
  const pin = "6831";
  const env = {
    MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: secret,
    MAHORAGA_CLOUD_OWNER_PIN_HASH: auth.hashOwnerLoginPin(pin, secret),
  };
  assert.deepEqual(auth.verifyOwnerLoginPin(pin, env), { ok: true });
  assert.equal(auth.verifyOwnerLoginPin("6832", env).code, "cloud-owner-login-required");

  for (const invalid of ["683", "68310", "68a1", " 6831", 6831, null]) {
    assert.equal(auth.verifyOwnerLoginPin(invalid, env).code, "cloud-owner-login-required");
  }
  assert.equal(auth.verifyOwnerLoginPin(pin, { ...env, MAHORAGA_CLOUD_OWNER_LOGIN_SECRET: "short" }).code, "cloud-owner-login-secret-invalid");
});

test("owner PIN rate policy locks repeated failures and resets after the lock window", async () => {
  const source = stripTypeScriptTypes(await read("lib/owner-login.ts"));
  const auth = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const now = 1_000_000;
  let state = null;
  for (let index = 0; index < 4; index += 1) state = auth.nextOwnerLoginFailure(state, now + index, 5);
  assert.equal(auth.ownerLoginRetryAfter(state, now + 4), 0);
  state = auth.nextOwnerLoginFailure(state, now + 4, 5);
  assert.ok(auth.ownerLoginRetryAfter(state, now + 5) >= 899);
  assert.equal(auth.ownerLoginRetryAfter(state, now + 15 * 60 * 1000 + 5), 0);
});
