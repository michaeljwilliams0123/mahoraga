import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("HF discovery on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1038 as observational fail-closed surface only", () => {
    const card = readFileSync(join(root, "components/cockpit/HuggingFaceDiscoveryCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Bounded read-only/);
    assert.match(card, /Merged #1038/);
    assert.match(card, /e92992c/);
    assert.match(card, /read-only discovery/);
    assert.match(card, /offline benchmark preflight/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /No hosted inference, no model admission, no runtime capability, no production activation, no authority claims/);
    assert.match(card, /Fail-closed/);
    assert.match(view, /HuggingFaceDiscoveryCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
