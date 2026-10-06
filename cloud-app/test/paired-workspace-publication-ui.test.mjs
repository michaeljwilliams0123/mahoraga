import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/PairedWorkspacePublicationCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const pagesStatus = readFileSync(join(root, "components/cockpit/PagesWorkspaceStatusCard.tsx"), "utf8");
const chat = readFileSync(join(root, "components/workspace/chat-view.tsx"), "utf8");

describe("GitHub Pages workspace status UI", () => {
  it("keeps Pages online as presentation while execution and authority stay separate", () => {
    assert.match(cockpit, /<PagesWorkspaceStatusCard coreReady=\{coreReady\} bridgeOrigin=\{pagesBridgeOrigin\} \/>/);
    assert.match(pagesStatus, /GitHub Pages workspace/);
    assert.match(pagesStatus, /Online · dynamic runtime client/);
    assert.match(pagesStatus, /github\.io workspace stays online independently of execution connectivity/);
    assert.match(pagesStatus, /runtime connection supplies live capability and task observations/);
    assert.match(pagesStatus, /Mahoraga remains the product; 7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(pagesStatus, /Disconnected \/ offline/);
    assert.match(pagesStatus, /Execution readiness, cognition readiness, and traffic authority remain separate/);
    assert.match(pagesStatus, /Execution remains fail-closed/);
    assert.match(pagesStatus, /Authentication and recovery pairing boundaries are unchanged/);
    assert.match(pagesStatus, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN from MAHORAGA_PAGES_BRIDGE_ORIGIN/);
    assert.match(pagesStatus, /not configured; no live Cloudflare connection is claimed/);
    assert.match(cockpit, /GitHub Pages workspace<\/dt><dd>Online · presentation only/);
  });

  it("shows Cloudflare sign-in only when the Pages bridge origin is configured", () => {
    assert.match(cockpit, /const pagesBridgeOrigin = process\.env\.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN\?\.trim\(\) \?\? ""/);
    assert.match(chat, /const cloudBridgeOrigin = process\.env\.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN\?\.trim\(\) \?\? ""/);
    assert.match(chat, /\{cloudBridgeOrigin && <button type="button" onClick=\{openCloudSignIn\}><Link2 size=\{16\} \/> Open Cloudflare sign-in<\/button>\}/);
    assert.doesNotMatch(`${chat}\n${cockpit}`, /https:\/\/mahoraga-owner-gateway\.mahoraga-mjw0123\.workers\.dev/);
  });
});

describe("paired Cloudflare workspace publication UI", () => {
  it("keeps Mahoraga as the product and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(card, /product: "Mahoraga"/);
    assert.match(card, /buildProvenanceOnly: "7.0.0-alpha.2"/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
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
    assert.doesNotMatch(card, /Paired after exact-main acceptance/);
    assert.doesNotMatch(card, /publication is paired/i);
  });

  it("wires the fail-closed publication state into the cockpit", () => {
    assert.match(cockpit, /PairedWorkspacePublicationCard/);
    assert.match(cockpit, /Candidate publication and runtime acceptance remain separate/);
    assert.match(cockpit, /exact-main provenance is unverified until an exact-SHA acceptance receipt/);
    assert.match(cockpit, /paired status stays unverified until that receipt is observed/);
    assert.match(cockpit, /\/api\/ready is observational execution\/durable-state evidence only/);
  });
});
