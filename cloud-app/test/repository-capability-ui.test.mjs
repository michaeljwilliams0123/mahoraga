import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/RepositoryCapabilityCard.tsx"), "utf8");

describe("7.0.0-alpha.2 repository capability cockpit UI", () => {
  it("keeps Mahoraga as product and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpitView, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpitView, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpitView, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces #982 inspect/write boundary as observational and fail-closed", () => {
    assert.match(cockpitView, /<RepositoryCapabilityCard \/>/);
    assert.match(card, /repository\.inspect and repository\.write are reported separately/);
    assert.match(card, /executable repository provider/);
    assert.match(card, /fresh capability attestation/);
    assert.match(card, /Cloudflare Access authenticates ingress but does not grant GitHub execution/);
    assert.match(card, /not traffic authority/);
    assert.match(card, /does not claim the unbound production repository provider is live/);
    assert.doesNotMatch(card, /enable.*runtime flags/);
    assert.doesNotMatch(card, /Control Edge/);
  });
});
