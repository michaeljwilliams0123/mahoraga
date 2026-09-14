import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("the direct Railway owner login mints only a server-side session cookie", async () => {
  const [route, gateway, login] = await Promise.all([
    read("app/api/runtime/login/route.ts"),
    read("lib/cloud-owner-gateway.ts"),
    read("lib/owner-login.ts"),
  ]);

  assert.match(route, /establishOwnerLoginSession/);
  assert.match(route, /set-cookie/);
  assert.match(gateway, /verifyOwnerLoginSecret/);
  assert.match(login, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET/);
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
  assert.match(chat, /Sign in to Mahoraga/);
  assert.match(chat, /ownerLoginSecret/);
  assert.match(types, /onOwnerLogin/);
  assert.match(relay, /cloud-owner-auth-required/);
  assert.doesNotMatch(`${workspace}\n${chat}\n${types}`, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET/);
});

test("owner login responses prevent caching for successful and failed authentication", async () => {
  const source = await read("app/api/runtime/login/route.ts");
  const gateway = `export function establishOwnerLoginSession(request, supplied) {
    if (supplied === "valid") return { cookie: "owner-session=test; HttpOnly; Secure; SameSite=Strict" };
    const error = new Error(supplied === "unconfigured" ? "cloud-gateway-not-configured" : "cloud-owner-login-required");
    error.status = supplied === "unconfigured" ? 503 : 401;
    throw error;
  }
  export function gatewayFailure(error) { return { code: error.message, status: error.status }; }`;
  const gatewayUrl = `data:text/javascript,${encodeURIComponent(gateway)}`;
  const importPath = '"@/lib/cloud-owner-gateway"';
  assert.equal(source.split(importPath).length, 2, "the test must replace the gateway import exactly once");
  const isolated = stripTypeScriptTypes(source.replace(importPath, JSON.stringify(gatewayUrl)));
  const { POST } = await import(`data:text/javascript,${encodeURIComponent(isolated)}`);

  for (const [ownerSecret, status] of [["valid", 200], ["invalid", 401], ["unconfigured", 503]]) {
    const response = await POST(new Request("https://example.test/api/runtime/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerSecret }),
    }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.has("set-cookie"), status === 200);
    assert.equal((await response.json()).authenticated, status === 200);
  }
});
