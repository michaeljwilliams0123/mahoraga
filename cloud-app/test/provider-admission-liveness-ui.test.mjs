import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surface = readFileSync(join(root, "lib/provider-admission-liveness.ts"), "utf8");
const card = readFileSync(join(root, "components/cockpit/ProviderAdmissionRenewalCard.tsx"), "utf8");
const grid = readFileSync(join(root, "components/cockpit/ConnectorRoutingCards.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("provider admission renewal UI", () => {
  it("binds liveness to authoritative runtime capability evidence and fails closed", () => {
    assert.match(surface, /11,26,41,56/);
    assert.match(surface, /not top-of-hour/);
    assert.match(surface, /isolated from deploy workflow concurrency/);
    assert.match(surface, /assistant\.respond/);
    assert.match(surface, /capability\.routable === true/);
    assert.match(surface, /providerReasonCode/);
    assert.match(surface, /zeroCreditEligible === true/);
    assert.match(surface, /expiry\.timestamp > now/);
    assert.match(surface, /canaryExpiresAt/);
    assert.match(surface, /never invent live proof/);
    assert.match(card, /runtimeCapabilities/);
    assert.match(card, /projectProviderAdmissionLiveness\(runtimeCapabilities\)/);
    assert.match(grid, /ProviderAdmissionRenewalCard runtimeCapabilities=\{runtimeCapabilities\}/);
    assert.doesNotMatch(card, /health/);
    assert.match(cockpit, /ConnectorRoutingCards/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
