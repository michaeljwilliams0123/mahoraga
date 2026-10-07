import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTO_RECONNECT_DELAY_MS, subscribePagesReconnect } from "../lib/pages-reconnect.ts";

test("sign-in return and network recovery request one fresh authenticated connection", () => {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  let calls = 0;
  const stop = subscribePagesReconnect(() => calls++, { window, document });
  window.dispatchEvent(new Event("focus"));
  assert.equal(calls, 0);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  assert.equal(calls, 1);
  stop();
  window.dispatchEvent(new Event("online"));
  assert.equal(calls, 1);
});


test("visible disconnected workspace self-recovers after a bounded delay", () => {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let calls = 0;
  let scheduled: (() => void) | null = null;
  let cleared = false;
  const timers = {
    set(callback: () => void, ms: number) {
      assert.equal(ms, AUTO_RECONNECT_DELAY_MS);
      scheduled = callback;
      return "timer";
    },
    clear(timer: unknown) {
      assert.equal(timer, "timer");
      cleared = true;
    },
  };
  const stop = subscribePagesReconnect(() => calls++, { window, document }, timers);
  assert.equal(calls, 0);
  assert.ok(scheduled);
  (scheduled as () => void)();
  assert.equal(calls, 1);
  window.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1);
  stop();
  assert.equal(cleared, true);
});

test("failed workspace connection captures its diagnostic before teardown clears it", async () => {
  const source = await readFile(new URL("../components/workspace.tsx", import.meta.url), "utf8");
  const failedConnection = source.slice(source.indexOf("if (!resumed) {"), source.indexOf("const capabilities = transport.transportKind"));
  const capture = failedConnection.indexOf("const code = transport.sessionDiagnostic");
  const teardown = failedConnection.indexOf("transport.disconnect()");
  assert.ok(capture >= 0 && teardown > capture, "preserve the failure diagnostic before clearing the transport");
});

test("workspace suppresses timed reconnect while owner authentication is required and clears stale route errors on recovery", async () => {
  const source = await readFile(new URL("../components/workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /runtimeBusy \|\| ownerLoginBusy \|\| ownerLoginRequired/);
  assert.match(source, /current === ASSISTANT_ROUTE_UNROUTABLE_ERROR \? null : current/);
  assert.match(source, /setRuntimeError\(ASSISTANT_ROUTE_UNROUTABLE_ERROR\)/);
});
