import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { subscribePagesReconnect } from "../lib/pages-reconnect.ts";

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

test("failed workspace connection captures its diagnostic before teardown clears it", async () => {
  const source = await readFile(new URL("../components/workspace.tsx", import.meta.url), "utf8");
  const failedConnection = source.slice(source.indexOf("if (!resumed) {"), source.indexOf("const capabilities = transport.transportKind"));
  const capture = failedConnection.indexOf("const code = transport.sessionDiagnostic");
  const teardown = failedConnection.indexOf("transport.disconnect()");
  assert.ok(capture >= 0 && teardown > capture, "preserve the failure diagnostic before clearing the transport");
});
