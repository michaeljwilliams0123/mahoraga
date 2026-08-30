import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";

test("one dual-primary integration lease persists, reports overlap, and enforces owner release", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-integration-lease-"));
  const file = path.join(root, "runtime.sqlite");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let database = new RuntimeDatabase(file, { allowLegacyPlaintextWrites: true });
  const local = database.acquireIntegrationLease({
    controllerId: "primary-local-codex", durationMs: 60_000,
    purpose: "Integrate verified attachment support", paths: ["src", "web/app.js"],
  });
  assert.equal(local.acquired, true);
  const cloud = database.acquireIntegrationLease({
    controllerId: "primary-cloud-codex", durationMs: 60_000,
    purpose: "Integrate another return", paths: ["src/server.mjs"],
  });
  assert.equal(cloud.acquired, false);
  assert.deepEqual(cloud.overlaps, ["src"]);
  database.close();

  database = new RuntimeDatabase(file, { allowLegacyPlaintextWrites: true });
  assert.equal(database.getIntegrationLease().leaseId, local.lease.leaseId);
  assert.throws(() => database.releaseIntegrationLease({ controllerId: "primary-cloud-codex", leaseId: local.lease.leaseId }), /owner-required/);
  assert.equal(database.releaseIntegrationLease({ controllerId: "primary-local-codex", leaseId: local.lease.leaseId }).released, true);
  assert.equal(database.getIntegrationLease(), null);
  database.close();
});

test("expired integration leases are removed before another Primary acquires", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-integration-expiry-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  database.acquireIntegrationLease({ controllerId: "primary-local-codex", durationMs: 1_000, purpose: "Short integration" });
  assert.equal(database.getIntegrationLease(new Date(Date.now() + 2_000)), null);
  assert.equal(database.acquireIntegrationLease({ controllerId: "primary-cloud-codex", durationMs: 1_000, purpose: "Take expired lease" }).acquired, true);
});
