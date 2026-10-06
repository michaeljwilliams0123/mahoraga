import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("evidence-gated cognitive tools on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1002 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/EvidenceGatedCognitiveCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Evidence-gated cognitive tools/);
    assert.match(card, /merged #1002/);
    assert.match(card, /dae84de/);
    assert.match(card, /fresh, enabled runtime route observation/);
    assert.match(card, /AGI and SGI are not runtime switches/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /EvidenceGatedCognitiveCard/);
    assert.match(view, /Evidence-gated cognitive tools/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
    assert.doesNotMatch(card, /AGI enabled|SGI enabled|superiority verified/i);
  });
});
