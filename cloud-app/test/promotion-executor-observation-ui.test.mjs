import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/PromotionExecutorObservationCard.tsx"), "utf8");
const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("7.0.0-alpha.2 promotion executor observation cockpit UI", () => {
  it("surfaces merged #1154 as observational fail-closed freshness only", () => {
    assert.match(card, /Promotion executor observation/);
    assert.match(card, /Fail-closed freshness/);
    assert.match(card, /#1154/);
    assert.match(card, /contradictory/);
    assert.match(card, /future-dated/);
    assert.match(card, /substrateIdentity: unattested/);
    assert.match(card, /promotionAuthority: unassessed/);
    assert.match(card, /never grants deployment authority/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Not execution readiness, cognition readiness, or traffic authority/);
    assert.match(view, /PromotionExecutorObservationCard/);
  });
});
