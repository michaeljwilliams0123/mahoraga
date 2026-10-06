import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("mobile-safe owner workspace entry on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1000 as observational entry truth only", () => {
    const card = readFileSync(join(root, "components/cockpit/OwnerWorkspaceEntryCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    const pages = readFileSync(join(root, "components/cockpit/PagesWorkspaceStatusCard.tsx"), "utf8");
    const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
    assert.match(card, /Access gateway · mobile-safe/);
    assert.match(card, /Merged #1000/);
    assert.match(card, /mahoraga-owner-gateway\.mahoraga-mjw0123\.workers\.dev/);
    assert.match(card, /derived presentation\/provenance mirror/);
    assert.match(card, /not the normal mobile launch URL/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /not source authority, execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /OwnerWorkspaceEntryCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.match(pages, /not the normal owner or mobile launch URL/);
    assert.match(command, /Mobile-safe owner workspace entry/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
