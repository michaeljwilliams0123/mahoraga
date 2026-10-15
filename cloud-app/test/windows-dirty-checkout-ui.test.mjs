import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("Windows dirty checkout preservation UI", () => {
  it("keeps Mahoraga as product identity and 7.0.0-alpha.2 as provenance-only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? \"Mahoraga\"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h[1-6][^>]*>7\.0\.0-alpha\.2/);
  });

  it("surfaces observational StatusCard for Windows convergence dirty-checkout preservation", () => {
    assert.match(cockpit, /label=\"Windows convergence checkout\"/);
    assert.match(cockpit, /value=\"Dirty worktree preserved \(observational\)\"/);
    assert.match(cockpit, /controller-worktree-dirty/);
    assert.match(cockpit, /git status --porcelain --untracked-files=all/);
    assert.match(cockpit, /fails closed/i);
    assert.match(cockpit, /leaves the checkout untouched/);
    assert.match(cockpit, /Does not enable the controller or claim a current-main Windows listener/);
    assert.match(cockpit, /Observational only; no traffic authority/);
  });
});
