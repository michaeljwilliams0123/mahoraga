import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";

test("capability readiness persists independently per capability", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-readiness-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  database.setCapabilityReadiness({ workerId: "desktop", capability: "desktop.inspect", processStatus: "live", providerStatus: "ready", canaryStatus: "verified", providerObservedAt: "2026-08-25T12:00:00.000Z", canaryVerifiedAt: "2026-08-25T12:00:00.000Z" });
  database.setCapabilityReadiness({ workerId: "desktop", capability: "desktop.interact", processStatus: "live", providerStatus: "ready", canaryStatus: "never", providerObservedAt: "2026-08-25T12:00:00.000Z" });
  const rows = database.listCapabilityReadiness("desktop");
  assert.equal(rows.find((item) => item.capability === "desktop.inspect").canaryStatus, "verified");
  assert.equal(rows.find((item) => item.capability === "desktop.interact").canaryStatus, "never");
});
