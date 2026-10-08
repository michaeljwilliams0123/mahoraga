import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("GrokBot architecture on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1034 as observational source explanation only", () => {
    const card = readFileSync(join(root, "components/cockpit/GrokBotArchitectureCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /GrokBot architecture/);
    assert.match(card, /Merged #1034/);
    assert.match(card, /docs\/GROKBOT-ARCHITECTURE\.md/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /No capability, provider, or review lane is registered/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /GrokBotArchitectureCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
