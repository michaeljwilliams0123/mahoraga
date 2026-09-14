import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
