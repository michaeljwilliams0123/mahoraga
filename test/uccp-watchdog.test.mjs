import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const modulePath = new URL("../src/state/watchdog.mjs", import.meta.url);

async function loadWatchdogModule() {
  assert.equal(existsSync(modulePath), true, "src/state/watchdog.mjs must exist");
  return import(modulePath.href);
}

test("watchdog is candidate-port only", async () => {
  const { ContainmentWatchdog } = await loadWatchdogModule();
  assert.throws(() => new ContainmentWatchdog({ port: 4782, check: async () => true, rollback: async () => {} }), /watchdog-candidate-port-required/);
});

test("watchdog debounces transient failures and rolls back after consecutive failures", async () => {
  const { ContainmentWatchdog } = await loadWatchdogModule();
  const outcomes = [false, true, false, false];
  let rollbackCount = 0;
  const watchdog = new ContainmentWatchdog({
    port: 4783,
    intervalMs: 500,
    failureThreshold: 2,
    check: async () => outcomes.shift() ?? true,
    rollback: async () => { rollbackCount += 1; },
  });

  assert.equal(await watchdog.evaluateOnce(), false);
  assert.equal(rollbackCount, 0);
  assert.equal(watchdog.snapshot().consecutiveFailures, 1);

  assert.equal(await watchdog.evaluateOnce(), true);
  assert.equal(watchdog.snapshot().consecutiveFailures, 0);

  assert.equal(await watchdog.evaluateOnce(), false);
  assert.equal(rollbackCount, 0);
  assert.equal(await watchdog.evaluateOnce(), false);
  assert.equal(rollbackCount, 1);
  assert.equal(watchdog.snapshot().monitoring, false);
  assert.equal(watchdog.snapshot().containmentTriggered, true);
});

test("watchdog stop is idempotent", async () => {
  const { ContainmentWatchdog } = await loadWatchdogModule();
  const watchdog = new ContainmentWatchdog({ port: 4783, check: async () => true, rollback: async () => {} });
  watchdog.start();
  watchdog.stop();
  watchdog.stop();
  assert.equal(watchdog.snapshot().monitoring, false);
});