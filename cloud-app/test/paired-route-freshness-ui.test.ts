import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("paired route freshness on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1023 as observational route evidence only", () => {
    const card = readFileSync(join(root, "components/cockpit/PairedRouteFreshnessCard.tsx"), "utf8");
    const host = readFileSync(join(root, "components/cockpit/OpenAiRouteCreditsCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /15-minute freshness, health, identity/);
    assert.match(card, /Merged #1023/);
    assert.match(card, /419ebf23c8b0/);
    assert.match(card, /unique worker identity/);
    assert.match(card, /workload limit fail closed/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /Not execution readiness, cognition proof, spending authority, provider activation, or production traffic authority/);
    assert.match(host, /PairedRouteFreshnessCard/);
    assert.match(view, /OpenAiRouteCreditsCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
