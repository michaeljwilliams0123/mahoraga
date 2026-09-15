import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";

test("worker refreshes provider and canary evidence on readiness.refresh", async (t) => {
  const child = fork(new URL("../src/worker-process.mjs", import.meta.url), ["local-core"], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  t.after(() => { if (child.connected) child.send({ type: "shutdown" }); else child.kill(); });
  let readinessCount = 0;
  let initialComplete = false;
  const refreshed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("readiness-refresh-timeout")), 10000);
    child.on("message", (message) => {
      if (message?.type === "provider.readiness") readinessCount += 1;
      if (message?.type === "readiness.complete" && !initialComplete) {
        initialComplete = true;
        child.send({ type: "readiness.refresh" });
      } else if (message?.type === "readiness.complete" && initialComplete) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  await refreshed;
  assert.equal(readinessCount >= 2, true);
});


test("desktop readiness never executes manual communication send canaries", async (t) => {
  const child = fork(new URL("../src/worker-process.mjs", import.meta.url), ["desktop"], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  t.after(() => { if (child.connected) child.send({ type: "shutdown" }); else child.kill(); });
  const seen = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("desktop-readiness-timeout")), 30000);
    child.on("message", (message) => {
      seen.push(message);
      if (message?.type === "readiness.complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  assert.equal(seen.some((message) => message?.type === "capability.canary" && message.capability === "communication.send"), false);
});