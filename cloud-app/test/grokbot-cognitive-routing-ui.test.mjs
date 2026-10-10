import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("GrokBot cognitive routing on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1037 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/GrokBotCognitiveRoutingCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Bounded Node children \(#1037\)/);
    assert.match(card, /Observational only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /GrokBotCognitiveRoutingCard/);
  });
});
