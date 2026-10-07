import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("openai route credits on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1021 as observational projection only", () => {
    const card = readFileSync(join(root, "components/cockpit/OpenAiRouteCreditsCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /creditsUsed tri-state/);
    assert.match(card, /openai-primary/);
    assert.match(card, /openai-destiny/);
    assert.match(card, /Merged #1021/);
    assert.match(card, /unknown/);
    assert.match(card, /route-unconfigured/);
    assert.match(card, /licensed-cloud/);
    assert.match(card, /not metered-cloud/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, spending authority, or production traffic authority/);
    assert.match(view, /OpenAiRouteCreditsCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
