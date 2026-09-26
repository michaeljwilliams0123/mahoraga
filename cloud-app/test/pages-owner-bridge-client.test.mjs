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

function installBridgeHarness(t, bridgeOrigin) {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  let now = 0;
  let nextTimerId = 1;
  let messageHandler = null;
  const timers = new Map();
  const posts = [];
  const iframeListeners = new Map();
  const contentWindow = {
    postMessage(message, targetOrigin) {
      posts.push({ message, targetOrigin });
    },
  };
  const iframe = {
    contentWindow,
    hidden: false,
    referrerPolicy: "",
    tabIndex: 0,
    src: "",
    setAttribute() {},
    addEventListener(type, listener) { iframeListeners.set(type, listener); },
    remove() {},
  };

  globalThis.window = {
    addEventListener(type, listener) { if (type === "message") messageHandler = listener; },
    removeEventListener(type, listener) { if (type === "message" && messageHandler === listener) messageHandler = null; },
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "iframe");
      return iframe;
    },
    body: {
      appendChild(node) {
        assert.equal(node, iframe);
        iframeListeners.get("load")?.();
      },
    },
  };
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, { callback, at: now + Number(delay) });
    return id;
  };
  globalThis.clearTimeout = (id) => { timers.delete(id); };

  t.after(() => {
    if (original.window === undefined) delete globalThis.window;
    else globalThis.window = original.window;
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
    globalThis.setTimeout = original.setTimeout;
    globalThis.clearTimeout = original.clearTimeout;
  });

  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function advance(ms) {
    now += ms;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      timer.callback();
      await flush();
    }
    await flush();
  }

  function reply(result) {
    const posted = posts.at(-1);
    assert.ok(posted);
    assert.ok(messageHandler);
    messageHandler({
      origin: bridgeOrigin,
      source: contentWindow,
      data: {
        protocolVersion: 1,
        requestId: posted.message.requestId,
        ok: true,
        result,
      },
    });
  }

  return { posts, advance, reply, flush };
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
  assert.match(source, /FRAME_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(source, /ACTION_TIMEOUT_MS\s*=\s*60_000/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|MAHORAGA_CLOUD_SESSION_SECRET|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("bridge action keeps the same request pending past ten seconds and accepts one late reply", async (t) => {
  const bridgeOrigin = "https://gateway.example";
  const harness = installBridgeHarness(t, bridgeOrigin);
  const client = await clientModule();
  const bridge = new client.PagesOwnerBridgeClient(bridgeOrigin);
  const resultPromise = bridge.call("chat", { conversationId: "conv-1", idempotencyKey: "idem-1" });
  let settlement = "pending";
  void resultPromise.then(() => { settlement = "resolved"; }, () => { settlement = "rejected"; });

  await harness.flush();
  assert.equal(harness.posts.length, 1);
  const originalRequestId = harness.posts[0].message.requestId;

  await harness.advance(10_001);
  assert.equal(settlement, "pending");
  assert.equal(harness.posts.length, 1);

  const expected = { conversation: { id: "conv-1" }, task: null, objective: null, decision: {} };
  harness.reply(expected);
  assert.deepEqual(await resultPromise, expected);
  assert.equal(harness.posts.length, 1);
  assert.equal(harness.posts[0].message.requestId, originalRequestId);
});

test("busy chat copy describes thinking or answer recovery without declaring the runtime degraded", async () => {
  const chat = await read("components/workspace/chat-view.tsx");
  assert.match(chat, /Thinking \/ recovering answer/);
  assert.doesNotMatch(chat, /Thinking \/ recovering answer[^\n]*Degraded/i);
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
