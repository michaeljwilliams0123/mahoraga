import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const readiness = readFileSync(join(root, "lib/interaction-readiness.ts"), "utf8");

describe("7.0.0-alpha.2 cockpit #759 zero-credit cutover UI", () => {
  it("separates execution, cognition, and traffic-authority claims", () => {
    assert.match(cockpit, /Execution readiness/);
    assert.match(cockpit, /Cloudflare cognition/);
    assert.match(cockpit, /Traffic authority/);
    assert.match(command, /Traffic authority/);
    assert.match(command, /never inferred from \/api\/ready/);
  });

  it("surfaces provider-free-quota-exhausted as 503 not 502", () => {
    assert.match(cockpit, /provider-free-quota-exhausted surfaces as 503 not 502/);
    assert.match(command, /provider-free-quota-exhausted as 503 not 502/);
    assert.match(readiness, /provider-free-quota-exhausted/);
    assert.doesNotMatch(cockpit, /quota-exhausted as 502/);
  });

  it("shows fail-closed billing evidence and 8000-byte UTF-8 cognition ceiling", () => {
    assert.match(cockpit, /fail-closed unless verified billing class/);
    assert.match(cockpit, /8000-byte UTF-8 public cognition ceiling/);
    assert.match(command, /fail-closed until verified billing class/);
    assert.match(command, /8000-byte UTF-8/);
  });

  it("keeps product name Mahoraga and provenance-only 7.0.0-alpha.2", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
  });
});
