import test from "node:test";
import assert from "node:assert/strict";
import { deriveCapabilityReadiness, isCapabilityRoutable } from "../src/capability-readiness.mjs";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");
const OBSERVED = "2026-08-25T11:59:55.000Z";
const VERIFIED = "2026-08-25T11:59:00.000Z";

test("heartbeat liveness alone is never routable", () => {
  const readiness = deriveCapabilityReadiness({ process: { status: "live", observedAt: OBSERVED }, provider: { status: "unknown" }, canary: { status: "never" } }, NOW);
  assert.equal(readiness.routable, false);
  assert.equal(readiness.evidenceLevel, "observed");
  assert.equal(readiness.reason, "provider-unknown");
});

test("fresh provider and canary evidence makes a capability routable", () => {
  const readiness = deriveCapabilityReadiness({ process: { status: "live", observedAt: OBSERVED }, provider: { status: "ready" }, canary: { status: "verified", verifiedAt: VERIFIED }, capabilityClass: "write" }, NOW);
  assert.equal(readiness.routable, true);
  assert.equal(readiness.evidenceLevel, "verified");
  assert.deepEqual(isCapabilityRoutable({ attendedRequired: false, executionPlane: "local" }, readiness), { eligible: true, reason: null });
});

test("expired write canaries and missing attended authority fail closed", () => {
  const stale = deriveCapabilityReadiness({ process: { status: "live" }, provider: { status: "ready" }, canary: { status: "verified", verifiedAt: "2026-08-25T11:40:00.000Z" }, capabilityClass: "write" }, NOW);
  assert.equal(stale.reason, "canary-stale");
  const fresh = deriveCapabilityReadiness({ process: { status: "live" }, provider: { status: "ready" }, canary: { status: "verified", verifiedAt: VERIFIED }, capabilityClass: "write" }, NOW);
  assert.equal(isCapabilityRoutable({ attendedRequired: true, authoritySessionId: null, executionPlane: "attended-desktop" }, fresh).reason, "attended-session-required");
});
