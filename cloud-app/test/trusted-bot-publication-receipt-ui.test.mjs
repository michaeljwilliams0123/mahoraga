import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/TrustedBotPublicationReceiptCard.tsx"), "utf8");
const botCard = readFileSync(join(root, "components/cockpit/BotPushPublicationCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("trusted bot publication receipt UI", () => {
  it("keeps Mahoraga as the product and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(card, /product: "Mahoraga"/);
    assert.match(card, /buildProvenanceOnly: "7.0.0-alpha.2"/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(card, /<h[1-6][^>]*>7\.0\.0-alpha\.2/);
  });

  it("fails closed without an immutable Verify-bound receipt", () => {
    assert.match(card, /data-testid="trusted-bot-publication-receipt"/);
    assert.match(card, /Receipt required/);
    assert.match(card, /verified-main-publication-v1/);
    assert.match(card, /Actor identity alone is not publication trust/);
    assert.match(card, /fail closed/);
    assert.match(card, /does not grant traffic authority/);
    assert.match(card, /Railway remains zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.equal(card.includes("actorOnlyTrust: false"), true);
    assert.doesNotMatch(card, /publication authorized/i);
  });

  it("retires actor-only bot dispatch trust on the cockpit", () => {
    assert.match(botCard, /not eligible from actor or event checks alone/);
    assert.match(cockpit, /TrustedBotPublicationReceiptCard/);
    assert.match(cockpit, /Actor identity alone is not publication trust/);
  });
});
