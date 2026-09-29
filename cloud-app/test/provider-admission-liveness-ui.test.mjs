import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectProviderAdmissionLiveness } from "../lib/provider-admission-liveness.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("provider admission renewal UI", () => {
  it("projects cadence and observed fields without inventing proof", () => {
    const empty = projectProviderAdmissionLiveness(null);
    assert.equal(empty.canaryExpiresAt, null);
    assert.equal(empty.zeroCreditEligible, null);
    assert.match(empty.detail, /11,26,41,56/);
    assert.match(empty.detail, /not top-of-hour/);
    assert.match(empty.detail, /isolated from deploy workflow concurrency/);
    assert.match(empty.detail, /never invent live proof/);
    const observed = projectProviderAdmissionLiveness({
      runtime: { canaryExpiresAt: 123, zeroCreditEligible: true },
    });
    assert.equal(observed.canaryExpiresAt, "123");
    assert.equal(observed.zeroCreditEligible, true);
    assert.equal(observed.statusLabel, "Observed separately");
  });

  it("keeps the 7.0.0-alpha.2 workspace observational surface on CockpitView", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
