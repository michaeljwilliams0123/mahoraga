import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = readFileSync(new URL("../../src/capability-registry.mjs", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../lib/interaction-readiness.ts", import.meta.url), "utf8");
const connections = readFileSync(new URL("../components/workspace/connections-view.tsx", import.meta.url), "utf8");

test("specific persisted provider reason reaches the cloud workspace", () => {
  assert.match(registry, /routingReason:\s*readiness\.routable\s*\?\s*null\s*:\s*recorded\?\.lastErrorCode\s*\?\?\s*readiness\.reason/);
  assert.match(readiness, /route\?\.routingReason/);
  assert.match(connections, /capability\.routingReason/);
  assert.match(connections, /Readiness reason/);
});
