import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerPath = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);

function constant(source, name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9_]+);`));
  assert.ok(match, `${name} must remain explicit and reviewable`);
  return Number(match[1].replaceAll("_", ""));
}

test("capability telemetry streams roll over before they can pin an old Durable Object deployment", async () => {
  const source = await readFile(workerPath, "utf8");
  const heartbeat = constant(source, "TELEMETRY_HEARTBEAT_MS");
  const maxAge = constant(source, "TELEMETRY_STREAM_MAX_AGE_MS");

  assert.ok(maxAge > heartbeat, "stream survives at least one heartbeat");
  assert.ok(maxAge < 60_000, "stream rollover remains inside the client last-known-good window");
  assert.match(source, /expiry = setTimeout\(\(\) => \{[\s\S]*cleanup\(\);[\s\S]*controller\.close\(\)[\s\S]*TELEMETRY_STREAM_MAX_AGE_MS/);
  assert.match(source, /cancel: cleanup/);
  assert.match(source, /clearInterval\(timer\)[\s\S]*clearTimeout\(expiry\)/);
});

test("the workspace reconnects a server-ended capability stream without counting it as a failure", async () => {
  const source = await readFile(new URL("../cloud-app/test/capability-stream.test.mjs", import.meta.url), "utf8");
  assert.match(source, /server-ended streams reconnect immediately without counting a failure/);
  assert.match(source, /transport\.emit\(\{ event: 'closed' \}\)/);
  assert.match(source, /assert\.equal\(states\.at\(-1\)\.reconnects, 0\)/);
});
