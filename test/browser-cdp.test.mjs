import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executeBrowserCapability } from "../src/browser-worker.mjs";

test("browser status is side-effect free and points to the isolated cloud tool", async () => {
  const status = await executeBrowserCapability("browser.status");
  assert.equal(status.verified, true);
  assert.equal(status.executionPlane, "cloud-workspace");
  assert.equal(status.localLaunchAttempted, false);
  assert.equal(status.localExtensionRequired, false);
  assert.equal(status.interactionCapability, "cloud-browser-tool");
  await assert.rejects(() => executeBrowserCapability("browser.observe"), /unsupported-capability/);
});

test("browser status worker cannot launch or attach to a local browser", async () => {
  const source = await readFile(new URL("../src/browser-worker.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /child_process|spawn|chrome\.exe|remote-debugging|127\.0\.0\.1|browser\.smoke/);
});
