import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONTROL_CENTER_TITLE, assertLoopbackControlCenter, observeLoopbackControlCenter } from "../src/browser-cdp.mjs";
import { ensureChrome, shutdownBrowser } from "../src/browser-worker.mjs";

test("loopback observation returns bounded evidence without DOM or screenshot bytes in its receipt", async (t) => {
  assert.equal(CONTROL_CENTER_TITLE, "Mahoraga");
  const artifacts = mkdtempSync(path.join(os.tmpdir(), "mahoraga-browser-"));
  t.after(() => rmSync(artifacts, { recursive: true, force: true }));
  const events = new Map(); const calls = []; const requests = [];
  const session = {
    on(method, listener) { const handlers = events.get(method) ?? []; handlers.push(listener); events.set(method, handlers); },
    async call(method, params) {
      calls.push({ method, params });
      if (method === "Page.navigate") {
        events.get("Network.responseReceived")?.[0]({ response: { status: 200 } });
        events.get("Runtime.consoleAPICalled")?.[0]({ type: "warning", args: [{ value: "transient warning" }] });
      }
      if (method === "Runtime.evaluate") return { result: { result: { value: { title: "Mahoraga", origin: "http://127.0.0.1:4782" } } } };
      if (method === "Page.captureScreenshot") return { result: { data: Buffer.from("\u0089PNG\r\n\u001a\nsmall-image").toString("base64") } };
      if (method === "Page.getLayoutMetrics") return { result: { cssVisualViewport: { clientWidth: 1280, clientHeight: 720 } } };
      return { result: {} };
    },
    close() {},
  };
  const result = await observeLoopbackControlCenter({
    cdpBase: "http://127.0.0.1:9223", controlCenterUrl: "http://127.0.0.1:4782/", artifactDirectory: artifacts, taskId: "mhg-observe", retentionMs: 60000,
  }, {
    request: async (_base, route) => { requests.push(route); return route.startsWith("/json/new") ? { id: "target-1", webSocketDebuggerUrl: "ws://loopback/devtools/page/1" } : {}; },
    connect: async () => session,
  });
  assert.equal(result.title, "Mahoraga");
  assert.equal(result.receiptMetadata.screenshotWidth, 1280);
  assert.equal(result.receiptMetadata.screenshotHeight, 720);
  assert.equal(result.receiptMetadata.networkStatus2xx, 1);
  assert.equal(result.receiptMetadata.consoleWarnings, 1);
  assert.match(result.receiptMetadata.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.summary.includes("Mahoraga Control Center"), false);
  assert.equal(result.summary.includes("127.0.0.1"), false);
  assert.ok(calls.some((item) => item.method === "Page.captureScreenshot"));
  assert.ok(requests.some((route) => route.startsWith("/json/close/target-1")));
});

test("browser observation rejects any non-Control-Center origin", () => {
  assert.throws(() => assertLoopbackControlCenter("https://example.com/"), /origin-not-approved/);
});

test("managed Chrome refuses an unowned loopback CDP endpoint", async () => {
  await assert.rejects(() => ensureChrome({ request: async () => ({ Browser: "other Chrome" }) }), /browser-cdp-unowned/);
});

test("managed Chrome launch uses its own headless profile", async (t) => {
  let probes = 0; let launch;
  t.after(() => shutdownBrowser());
  await ensureChrome({
    request: async () => { probes += 1; if (probes === 1) throw new Error("not-listening"); return { Browser: "managed Chrome" }; },
    mkdirProfile: async () => {},
    launch: (executable, args, options) => {
      launch = { executable, args, options };
      return { killed: false, once() {}, kill() { this.killed = true; } };
    },
  });
  assert.equal(launch.args.includes("--headless=new"), true);
  assert.equal(launch.args.includes("--remote-debugging-address=127.0.0.1"), true);
  assert.ok(launch.args.some((item) => item.includes("state\\browser-profile") || item.includes("state/browser-profile")));
});
