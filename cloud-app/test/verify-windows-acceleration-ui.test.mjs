import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/VerifyWindowsAccelerationCard.tsx"), "utf8");

describe("7.0.0-alpha.2 cockpit Verify Windows acceleration", () => {
  it("surfaces observational StatusCard for Verify Windows acceleration", () => {
    assert.match(cockpit, /VerifyWindowsAccelerationCard/);
    assert.match(card, /Verify Windows acceleration/);
    assert.match(card, /Observational \(deduplicated gates\)/);
    assert.match(card, /Merged #1081/);
    assert.match(card, /verify:windows/);
    assert.match(card, /test:windows/);
    assert.match(card, /concurrency=4/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Merge #1081 is not live authority/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
