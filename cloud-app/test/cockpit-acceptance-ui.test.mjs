import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");

describe("7.0.0-alpha.2 cockpit Cloudflare acceptance evidence", () => {
  it("gates cognition and no-Railway-fallback on sanitized receipt fields only", () => {
    assert.match(cockpit, /const cognitionObserved = acceptance\.providerCognitionVerified === true;/);
    assert.match(cockpit, /const noRailwayVerified = acceptance\.noRailwayFallbackVerified === true;/);
    assert.match(cockpit, /providerCognitionVerified: providerCognitionVerified && !bypassApplied/);
    assert.match(cockpit, /noRailwayFallbackVerified: noRailwayFallbackVerified && !bypassApplied/);
    assert.match(cockpit, /Cloudflare cognition/);
    assert.match(cockpit, /No Railway fallback/);
    assert.match(cockpit, /Observed/);
    assert.match(cockpit, /Unverified/);
    assert.match(cockpit, /Unproven/);
    assert.match(cockpit, /rollback anchor/);
    assert.match(cockpit, /x-bypass-applied/);
    assert.match(cockpit, /never inferred from \/api\/ready/i);
  });

  it("keeps traffic authority separate and never flips it from ready or acceptance", () => {
    assert.match(cockpit, /Traffic authority/);
    assert.match(cockpit, /Separate \/ unverified/);
    assert.match(cockpit, /Never inferred from \/api\/ready/);
    assert.match(cockpit, /trafficAuthorityVerified/);
    assert.doesNotMatch(cockpit, /readyOk \? "Canonical traffic"/);
  });

  it("keeps product Mahoraga and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(types, /SanitizedAcceptanceReceipt/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces #779 cutover observational evidence and fails closed on missing packet/receipt fields", () => {
    const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
    assert.match(cockpit, /Exact SHA attestation/);
    assert.match(cockpit, /Durable Object uniqueness/);
    assert.match(cockpit, /admissionClosed/);
    assert.match(cockpit, /admissionRestored/);
    assert.match(cockpit, /Railway is manual-only rollback, not live execution/);
    assert.match(cockpit, /route\/billing\/uniqueness\/continuity required/);
    assert.match(cockpit, /authority not invented/);
    assert.match(cockpit, /failClosedMissing/);
    assert.match(types, /durableObjectUniquenessReceipt/);
    assert.match(types, /exactShaAttested/);
    assert.match(command, /Railway is manual-only rollback/);
    assert.doesNotMatch(cockpit, /inferred from \/api\/ready.*traffic authority granted/i);
  });
});
