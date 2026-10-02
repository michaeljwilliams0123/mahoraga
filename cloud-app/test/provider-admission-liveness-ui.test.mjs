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
    assert.match(surface, /2,7,12,17,22,27,32,37,42,47,52,57/);
    assert.doesNotMatch(surface, /11,26,41,56/);
    assert.match(surface, /offsets away from top-of-hour/);
    assert.match(surface, /1800000|1_800_000/);
    assert.match(surface, /independently verified admission/);
    assert.match(surface, /verifiedAt/);
    assert.match(surface, /canaryExpiresAt/);
    assert.match(surface, /no self-attestation/);
    assert.match(surface, /no runtime Cron/);
    assert.match(surface, /Railway zero authority/);
    assert.match(surface, /not continuous freshness/);
    assert.match(surface, /assistant\.respond/);
    assert.match(card, /Provider admission freshness/);
    assert.match(card, /Merge #952 is not live continuity or traffic authority/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /projectProviderAdmissionLiveness\(runtimeCapabilities\)/);
    assert.match(grid, /ProviderAdmissionRenewalCard runtimeCapabilities=\{runtimeCapabilities\}/);
    assert.doesNotMatch(card, /health/);
    assert.match(cockpit, /ConnectorRoutingCards/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});

describe("provider admission liveness semantics", () => {
  it("requires explicit zero-credit and future-canary proof instead of inferring health from routability", async () => {
    const { projectProviderAdmissionLiveness } = await import("../lib/provider-admission-liveness.ts");
    const now = Date.parse("2026-09-29T21:00:00.000Z");
    const routableOnly = projectProviderAdmissionLiveness([
      { capability:"assistant.respond", routable:true, enabled:true },
    ], now);
    assert.equal(routableOnly.statusLabel, "Unavailable / fail-closed");
    assert.equal(routableOnly.tone, "warn");
    assert.equal(routableOnly.zeroCreditEligible, null);
    assert.equal(routableOnly.verifiedAt, null);
    assert.equal(routableOnly.canaryExpiresAt, null);
  });

  it("accepts only explicit current admission and rejects partial, false, malformed, or expired proof", async () => {
    const { projectProviderAdmissionLiveness } = await import("../lib/provider-admission-liveness.ts");
    const now = Date.parse("2026-09-29T21:00:00.000Z");
    const project = (extra) => projectProviderAdmissionLiveness([{ capability:"assistant.respond", routable:true, enabled:true, ...extra }], now);
    const verified = "2026-09-29T20:59:00.000Z";
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:verified, canaryExpiresAt:"2026-09-29T21:40:00.000Z" }).statusLabel, "Margin held / admitted");
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:verified, canaryExpiresAt:"2026-09-29T21:05:00.000Z" }).statusLabel, "Current / admitted");
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:verified, canaryExpiresAt:"2026-09-29T21:00:30.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:false, verifiedAt:verified, canaryExpiresAt:"2026-09-29T21:40:00.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, canaryExpiresAt:"2026-09-29T21:40:00.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:verified }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:"not-a-time", canaryExpiresAt:"2026-09-29T21:40:00.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, verifiedAt:verified, canaryExpiresAt:"2026-09-29T20:59:59.000Z" }).tone, "warn");
  });
});
