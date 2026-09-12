import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflareRelayHandler } from "../relay/cloudflare-worker.mjs";

const baseEnv = {
  MAHORAGA_OWNER_IDENTITY: "owner@example.com",
  MAHORAGA_WORKSPACE_ORIGIN: "https://workspace.example",
  MAHORAGA_LOCAL_RELAY_TOKEN: "l".repeat(48),
};

function request(origin) {
  return new Request("https://relay.example/pair", {
    headers: {
      "cf-access-authenticated-user-email": baseEnv.MAHORAGA_OWNER_IDENTITY,
      origin,
      upgrade: "websocket",
    },
  });
}

test("private-repo cutover trusts only the configured workspace origin by default", async () => {
  const handler = createCloudflareRelayHandler();
  const configured = await handler.fetch(request(baseEnv.MAHORAGA_WORKSPACE_ORIGIN), baseEnv);
  assert.notEqual(configured.status, 403);

  const historicalPages = await handler.fetch(request("https://michaeljwilliams0123.github.io"), baseEnv);
  assert.equal(historicalPages.status, 403);
});

test("private-repo cutover permits an explicit legacy workspace origin during migration", async () => {
  const handler = createCloudflareRelayHandler();
  const env = {
    ...baseEnv,
    MAHORAGA_LEGACY_WORKSPACE_ORIGIN: "https://michaeljwilliams0123.github.io",
  };
  const historicalPages = await handler.fetch(request(env.MAHORAGA_LEGACY_WORKSPACE_ORIGIN), env);
  assert.notEqual(historicalPages.status, 403);
});
