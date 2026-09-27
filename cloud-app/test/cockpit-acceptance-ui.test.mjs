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

  it("surfaces provider admission restoration retry as bounded observational evidence", () => {
    assert.match(cockpit, /Provider admission restore retry/);
    assert.match(cockpit, /Provider restoration retry/);
    assert.match(cockpit, /Retry only transient 503 responses/);
    assert.match(cockpit, /same verified hard-zero billing attestation/);
    assert.match(cockpit, /bounded attempts and validated delay/);
    assert.match(cockpit, /persistent failure remains fail-closed/);
    assert.match(cockpit, /accept-provider-restore-503 is not traffic authority/);
    assert.match(cockpit, /Observational \/ fail-closed/);
  });

  it("surfaces the optional Codespaces environment without granting authority", () => {
    assert.match(cockpit, /Codespaces development environment/);
    assert.match(cockpit, /Optional \/ non-authoritative/);
    assert.match(cockpit, /Node 24 developer convenience from #812/);
    assert.match(cockpit, /locked dependencies only/);
    assert.match(cockpit, /exposes no ports/);
    assert.match(cockpit, /starts no Mahoraga service/);
    assert.match(cockpit, /GitHub metering and quota apply/);
    assert.match(cockpit, /GitHub and Cloudflare remain production authority/);
    assert.match(cockpit, /GitLab read-only/);
    assert.match(cockpit, /Railway non-routing/);
    assert.match(cockpit, /not a production host, inference provider, lifecycle automation, self-patching authority, deployment lane, or routing change/);
    assert.match(cockpit, /supplies no production authentication material/);
  });

  it("keeps product Mahoraga and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(types, /SanitizedAcceptanceReceipt/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
