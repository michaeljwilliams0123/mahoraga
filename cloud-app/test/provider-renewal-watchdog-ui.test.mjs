import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/ProviderRenewalWatchdogCard.tsx"), "utf8");

describe("7.0.0-alpha.2 provider renewal watchdog cockpit", () => {
  it("surfaces replace-stale renewal as observational and not traffic authority", () => {
    assert.match(cockpit, /ProviderRenewalWatchdogCard/);
    assert.match(cockpit, /Provider renewal watchdog/);
    assert.match(card, /Replace stale scheduled runs/);
    assert.match(card, /five-minute/);
    assert.match(card, /Deployment publication stays serialized and non-cancelling/);
    assert.match(card, /30-minute freshness margin/);
    assert.match(card, /exact-main verification/);
    assert.match(card, /billing re-proof/);
    assert.match(card, /renewal-without-deployment/);
    assert.match(card, /Merge #970 \(9fdb1b8\) is observational CI continuity only and is not traffic authority/);
    assert.match(card, /zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
