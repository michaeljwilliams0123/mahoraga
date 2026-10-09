import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/CloudInspectActionCard.tsx"), "utf8");

describe("7.0.0-alpha.2 cockpit surfaces #1036 cloud.inspect without claiming a live receipt", () => {
  it("renders the observational card on both cockpit surfaces", () => {
    assert.match(cockpit, /CloudInspectActionCard capabilities=\{runtimeCapabilities\}/);
    assert.match(command, /<CloudInspectActionCard \/>/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Unattested \/ hidden/);
    assert.match(card, /Capability hint only/);
    assert.match(card, /not traffic authority/);
    assert.match(card, /observation at most 90 seconds old/);
    assert.doesNotMatch(card, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
