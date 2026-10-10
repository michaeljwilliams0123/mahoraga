import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Exercise the exact gateway projection, not a rewritten approximation.
const gateway = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
const start = gateway.indexOf("function boundedCapability(value) {");
const end = gateway.indexOf("\nasync function runtimeCapabilities", start);
assert.ok(start >= 0 && end > start, "gateway projection source present");
const boundedCapability = runInNewContext(gateway.slice(start, end) + "\nboundedCapability");
const sample = () => ({
  capability: "cloud.inspect", routable: true, enabled: true, provider: "cloudflare",
  workerIds: ["cloudflare-readonly-inspector"], workerId: "cloudflare-readonly-inspector",
  lastObservedAt: new Date(Date.now() - 1_000).toISOString(),
  permissionClass: "read", costClass: "zero-credit", evidenceLevel: "runtime-execution",
  routingReason: null, providerReasonCode: null,
});

test("gateway preserves bounded identity and fresh observation only for cloud.inspect", () => {
  const input = sample();
  const projected = boundedCapability(input);
  assert.equal(projected.workerId, input.workerId);
  assert.equal(projected.lastObservedAt, input.lastObservedAt);
  assert.equal(projected.capability, "cloud.inspect");
  assert.equal(projected.permissionClass, "read");
  const other = boundedCapability({ ...input, capability: "repository.inspect" });
  assert.equal(other.workerId, undefined);
  assert.equal(other.lastObservedAt, undefined);
});

test("foreign/missing identity and stale/future/malformed observation fail closed", () => {
  const invalid = [
    [{ workerId: "foreign-worker" }, "workerId"],
    [{ workerId: undefined }, "workerId"],
    [{ workerIds: ["foreign-worker"] }, "workerId"],
    [{ lastObservedAt: "not-a-date" }, "lastObservedAt"],
    [{ lastObservedAt: undefined }, "lastObservedAt"],
    [{ lastObservedAt: new Date(Date.now() - 31_000).toISOString() }, "lastObservedAt"],
    [{ lastObservedAt: new Date(Date.now() + 6_000).toISOString() }, "lastObservedAt"],
  ];
  for (const [mutate, field] of invalid) {
    const projected = boundedCapability({ ...sample(), ...mutate });
    if (projected) assert.equal(projected[field], null, JSON.stringify(mutate));
  }
  assert.equal(boundedCapability({ ...sample(), permissionClass: "write" }), null);
  assert.equal(boundedCapability({ ...sample(), routable: false, enabled: true }), null);
});
