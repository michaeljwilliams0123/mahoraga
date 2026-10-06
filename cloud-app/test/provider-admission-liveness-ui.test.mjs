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
    assert.match(surface, /every five minutes/);
    assert.match(surface, /offset from top-of-hour/);
    assert.match(surface, /isolated from deploy workflow concurrency/);
    assert.match(surface, /assistant\.respond/);
    assert.match(surface, /assistant\.routable === true/);
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
    assert.equal(routableOnly.canaryExpiresAt, null);
  });

  it("accepts only explicit current admission and rejects partial, false, malformed, or expired proof", async () => {
    const { projectProviderAdmissionLiveness } = await import("../lib/provider-admission-liveness.ts");
    const now = Date.parse("2026-09-29T21:00:00.000Z");
    const project = (extra) => projectProviderAdmissionLiveness([{ capability:"assistant.respond", routable:true, enabled:true, ...extra }], now);
    assert.equal(project({ zeroCreditEligible:true, canaryExpiresAt:"2026-09-29T21:05:00.000Z" }).tone, "good");
    assert.equal(project({ zeroCreditEligible:true, canaryExpiresAt:"2026-09-29T21:00:30.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:false, canaryExpiresAt:"2026-09-29T21:05:00.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true }).tone, "warn");
    assert.equal(project({ canaryExpiresAt:"2026-09-29T21:05:00.000Z" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, canaryExpiresAt:"not-a-time" }).tone, "warn");
    assert.equal(project({ zeroCreditEligible:true, canaryExpiresAt:"2026-09-29T20:59:59.000Z" }).tone, "warn");
  });
});
