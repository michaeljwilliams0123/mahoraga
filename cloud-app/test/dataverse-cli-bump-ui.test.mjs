import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Dataverse CLI bump on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #991 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/DataverseCliBumpCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /@microsoft\/dataverse 1\.0\.81/);
    assert.match(card, /1\.0\.80 to 1\.0\.81/);
    assert.match(card, /tools\/dataverse-cli/);
    assert.match(card, /Merged #991/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /DataverseCliBumpCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
