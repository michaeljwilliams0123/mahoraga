import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sharp bounds bump on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1010 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/SharpBoundsBumpCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /sharp 0\.35\.5/);
    assert.match(card, /0\.35\.4 to 0\.35\.5/);
    assert.match(card, /cloud-app/);
    assert.match(card, /Merged #1010/);
    assert.match(card, /GIF delay/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /SharpBoundsBumpCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
