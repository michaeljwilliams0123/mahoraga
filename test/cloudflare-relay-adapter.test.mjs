import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflareRelayHandler } from "../relay/cloudflare-worker.mjs";

const env = {
  MAHORAGA_OWNER_IDENTITY: "owner@example.com",
  MAHORAGA_PAGES_ORIGIN: "https://michaeljwilliams0123.github.io",
};

test("Cloudflare relay adapter rejects unauthenticated, cross-origin, and non-WebSocket requests", async () => {
  const handler = createCloudflareRelayHandler();
  assert.equal((await handler.fetch(new Request("https://relay.example/pair"), env)).status, 403);
  const wrongOrigin = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: "https://evil.example", upgrade: "websocket" } });
  assert.equal((await handler.fetch(wrongOrigin, env)).status, 403);
  const ordinaryHttp = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_PAGES_ORIGIN } });
  assert.equal((await handler.fetch(ordinaryHttp, env)).status, 426);
});

test("Cloudflare relay adapter exposes no generic proxy route", async () => {
  const handler = createCloudflareRelayHandler();
  const request = new Request("https://relay.example/proxy?url=http://127.0.0.1:4782", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_PAGES_ORIGIN, upgrade: "websocket" } });
  assert.equal((await handler.fetch(request, env)).status, 404);
});
