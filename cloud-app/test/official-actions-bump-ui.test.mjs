import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("official-actions bump on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1077 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/OfficialActionsBumpCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /setup-node 7\.1\.0/);
    assert.match(card, /upload-artifact 7\.0\.2/);
    assert.match(card, /7\.0\.0 to 7\.1\.0/);
    assert.match(card, /7\.0\.1 to 7\.0\.2/);
    assert.match(card, /Merged #1077/);
    assert.match(card, /official-actions/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /OfficialActionsBumpCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
