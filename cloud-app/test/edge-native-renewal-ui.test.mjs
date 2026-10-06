import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("edge-native renewal on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1008 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/EdgeNativeRenewalCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Merged #1008/);
    assert.match(card, /3dfe67fb/);
    assert.match(card, /MAHORAGA_EXECUTION_RUNTIME/);
    assert.match(card, /NEXT_PUBLIC_MAHORAGA_PRIMARY_ORIGIN/);
    assert.match(card, /bridge\.subscribe/);
    assert.match(card, /workflow_dispatch/);
    assert.match(card, /Offline, Reconnecting, Verifying, Provider Standby, or Idle/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /EdgeNativeRenewalCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
