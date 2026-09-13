import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = readFileSync(new URL("../../src/capability-registry.mjs", import.meta.url), "utf8");
const relay = readFileSync(new URL("../lib/runtime-relay.ts", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../lib/interaction-readiness.ts", import.meta.url), "utf8");
const connections = readFileSync(new URL("../components/workspace/connections-view.tsx", import.meta.url), "utf8");

test("specific persisted provider reason reaches the cloud workspace", () => {
  assert.match(registry, /providerReasonCode:\s*recorded\?\.lastErrorCode/);
  assert.match(relay, /providerReasonCode\?: string \| null/);
  assert.match(readiness, /providerReasonCode/);
  assert.match(connections, /providerReasonCode/);
  assert.match(connections, /Readiness reason/);
});
