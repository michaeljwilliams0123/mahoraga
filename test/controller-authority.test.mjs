import test from "node:test";
import assert from "node:assert/strict";
import {
  controllerAuthoritySnapshot, IntegrationLeaseController, MAX_INTEGRATION_LEASE_MS, overlappingPaths,
} from "../src/controller-authority.mjs";

test("local and cloud primary controllers have identical bounded capabilities", () => {
  const authority = controllerAuthoritySnapshot();
  assert.equal(authority.model, "dual-primary-single-integration-lease");
  assert.equal(authority.authorizedControllers.length, 2);
  assert.deepEqual(authority.authorizedControllers[0].capabilities, authority.authorizedControllers[1].capabilities);
  assert.ok(authority.authorizedControllers[0].capabilities.includes("integrate"));
  assert.equal(authority.integration.concurrentHolders, 1);
  assert.equal(authority.integration.mergeIsAutomatic, false);
  assert.equal(authority.coreUpdateActivationAuthority, "user-only");
  assert.equal(authority.secondary.backwardCompatibleMailbox, true);
  assert.equal(authority.secondary.canIntegrate, false);
});

test("integration lease permits one bounded primary holder and expires safely", () => {
  let now = Date.parse("2026-08-25T00:00:00.000Z");
  const leases = new IntegrationLeaseController({ now: () => now });
  const local = leases.acquire({ controllerId: "primary-local-codex", durationMs: 1_000, purpose: "Integrate verified return", paths: ["src"] });
  assert.equal(local.acquired, true);
  const cloud = leases.acquire({ controllerId: "primary-cloud-codex", durationMs: 1_000, purpose: "Integrate other return", paths: ["src/server.mjs"] });
  assert.equal(cloud.acquired, false);
  assert.deepEqual(cloud.overlaps, ["src"]);
  assert.throws(() => leases.release({ controllerId: "primary-cloud-codex", leaseId: local.lease.leaseId }), /owner-required/);
  now += 1_000;
  assert.equal(leases.current(), null);
  assert.equal(leases.acquire({ controllerId: "primary-cloud-codex", durationMs: MAX_INTEGRATION_LEASE_MS, purpose: "Integrate after expiry" }).acquired, true);
});

test("path overlap is surfaced without prohibiting concurrent implementation", () => {
  assert.deepEqual(overlappingPaths(["src", "docs/a.md"], ["src/server.mjs", "test"]), ["src"]);
});

test("lease inputs reject unknown controllers and unbounded durations", () => {
  const leases = new IntegrationLeaseController();
  assert.throws(() => leases.acquire({ controllerId: "secondary-codex", durationMs: 100, purpose: "merge" }), /primary-controller-required/);
  assert.throws(() => leases.acquire({ controllerId: "primary-local-codex", durationMs: MAX_INTEGRATION_LEASE_MS + 1, purpose: "merge" }), /invalid-integration-lease-duration/);
});
