import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

async function clientModule() {
  const source = stripTypeScriptTypes(await read("lib/pages-owner-bridge-client.ts"));
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test("public bridge configuration accepts only an HTTPS origin with no path or credentials", async () => {
  const client = await clientModule();
  assert.equal(client.validatePublicBridgeOrigin("https://mahoraga-runtime-main-production.up.railway.app"), "https://mahoraga-runtime-main-production.up.railway.app");
  assert.equal(client.validatePublicBridgeOrigin("http://mahoraga-runtime-main-production.up.railway.app"), null);
  assert.equal(client.validatePublicBridgeOrigin("https://mahoraga-runtime-main-production.up.railway.app/api"), null);
  assert.equal(client.validatePublicBridgeOrigin(["https://user:pass", "@mahoraga-runtime-main-production.up.railway.app"].join("")), null);
  assert.equal(client.validatePublicBridgeOrigin(undefined), null);
});

test("Pages bridge client uses one hidden exact-origin frame with bounded requests", async () => {
  const source = await read("lib/pages-owner-bridge-client.ts");
  assert.match(source, /api\/runtime\/pages-bridge\/frame/);
  assert.match(source, /iframe\.hidden = true/);
  assert.match(source, /referrerPolicy = "no-referrer"/);
  assert.match(source, /event\.origin !== this\.bridgeOrigin/);
  assert.match(source, /event\.source !== this\.frame\?\.contentWindow/);
  assert.match(source, /postMessage\(request, this\.bridgeOrigin\)/);
  assert.match(source, /10_000/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|MAHORAGA_CLOUD_SESSION_SECRET|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("RuntimeRelay prefers the Pages bridge, keeps PIN login on the transport, and preserves recovery pairing", async () => {
  const [relay, workspace, chat] = await Promise.all([
    read("lib/runtime-relay.ts"),
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);

  assert.match(relay, /PagesOwnerBridgeClient/);
  assert.match(relay, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN/);
  assert.match(relay, /loginOwnerPin/);
  assert.match(relay, /bridgeClient/);
  assert.match(workspace, /transport\.loginOwnerPin\(ownerLoginPin\)/);
  assert.doesNotMatch(workspace, /fetch\("\/api\/runtime\/login"/);
  assert.match(chat, /Verified server-side and exchanged only for a secure owner session\./);
  assert.match(chat, /Recovery connection/);
  assert.match(relay, /decodePairingOffer/);
  assert.match(relay, /await bridge\.disconnect\(\);[\s\S]*if \(!this\.socket && !this\.session && !this\.cloudSession\) return;/);
});
