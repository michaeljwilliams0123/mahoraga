import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/PairedWorkspacePublicationCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("paired Cloudflare workspace publication UI", () => {
  it("keeps Mahoraga as the product and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(card, /product: "Mahoraga"/);
    assert.match(card, /buildProvenanceOnly: "7.0.0-alpha.2"/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Build provenance only/);
    assert.doesNotMatch(card, /<h[1-6][^>]*>7\.0\.0-alpha\.2/);
  });

  it("fails closed until an exact-SHA acceptance receipt proves pairing", () => {
    assert.match(card, /data-testid="paired-workspace-publication"/);
    assert.match(card, /Acceptance receipt required/);
    assert.match(card, /Candidate publication is not paired acceptance/);
    assert.match(card, /published candidate remains unverified until a valid exact-SHA receipt/);
    assert.match(card, /Static readiness grants no execution authority/);
    assert.match(card, /does not promote the primary host/);
    assert.match(card, /does not grant traffic authority/);
    assert.match(card, /Railway remains zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(card, /Paired status/);
    assert.match(card, /Unverified/);
    assert.doesNotMatch(card, /Paired after exact-main acceptance/);
    assert.doesNotMatch(card, /publication is paired/i);
  });

  it("renders publication and acceptance as separate cockpit dimensions", () => {
    assert.match(card, /data-testid="paired-workspace-dimensions"/);
    assert.match(card, /Publication/);
    assert.match(card, /Candidate bytes only/);
    assert.match(card, /Runtime acceptance/);
    assert.match(card, /Receipt missing/);
  });

  it("wires the fail-closed publication state into the cockpit", () => {
    assert.match(cockpit, /PairedWorkspacePublicationCard/);
    assert.match(cockpit, /Candidate publication and runtime acceptance remain separate/);
    assert.match(cockpit, /exact-main provenance is unverified until an exact-SHA acceptance receipt/);
    assert.match(cockpit, /paired status stays unverified until that receipt is observed/);
    assert.match(cockpit, /\/api\/ready is observational execution\/durable-state evidence only/);
  });
});
