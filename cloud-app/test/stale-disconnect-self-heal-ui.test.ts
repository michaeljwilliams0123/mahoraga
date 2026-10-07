import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("stale disconnect self-heal on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1014 as observational recovery only", () => {
    const card = readFileSync(join(root, "components/cockpit/StaleDisconnectSelfHealCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /One bounded 5s reconnect/);
    assert.match(card, /Merged #1014/);
    assert.match(card, /2a2e5e4245b1/);
    assert.match(card, /owner PIN authentication/);
    assert.match(card, /assistant\.respond routable/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /Not execution readiness, cognition proof, provider fallback, cost change, or production traffic authority/);
    assert.match(view, /StaleDisconnectSelfHealCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
