import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/ProviderRenewalWatchdogCard.tsx"), "utf8");

describe("7.0.0-alpha.2 provider admission renewal cockpit", () => {
  it("surfaces short one-shot renewal as observational and not traffic authority", () => {
    assert.match(cockpit, /ProviderRenewalWatchdogCard/);
    assert.match(cockpit, /Provider admission renewal/);
    assert.match(card, /Short five-minute checks/);
    assert.match(card, /one-shot check rather than a long-lived watchdog/);
    assert.match(card, /Deployment publication stays serialized and non-cancelling/);
    assert.match(card, /30-minute margin/);
    assert.match(card, /re-proves billing only when/);
    assert.match(card, /renews admission without redeploying/);
    assert.match(card, /not traffic authority or runtime readiness/);
    assert.match(card, /zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
