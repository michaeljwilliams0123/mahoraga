import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Windows healthy candidate on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1096 as observational source contract only", () => {
    const card = readFileSync(join(root, "components/cockpit/WindowsHealthyCandidateCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Rejects unhealthy exact-SHA candidates/);
    assert.match(card, /Merged #1096/);
    assert.match(card, /runtime\.healthy === true/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /Not live Windows controller activation/);
    assert.match(view, /WindowsHealthyCandidateCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
