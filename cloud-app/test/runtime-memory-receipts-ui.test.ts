import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("runtime semantic memory receipts on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1011 as observational memory and receipt evidence only", () => {
    const card = readFileSync(join(root, "components/cockpit/RuntimeMemoryReceiptsCard.tsx"), "utf8");
    const host = readFileSync(join(root, "components/cockpit/PagesWorkspaceStatusCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /Receipts observed · fail-closed/);
    assert.match(card, /Merged #1011/);
    assert.match(card, /6ce85261988d/);
    assert.match(card, /Illegal invocation/);
    assert.match(card, /mahoraga-memory-db/);
    assert.match(card, /mahoraga-memory-index/);
    assert.match(card, /24-hour grace period/);
    assert.match(card, /64 bytes/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /Not execution readiness, cognition proof, or production traffic authority/);
    assert.match(host, /RuntimeMemoryReceiptsCard/);
    assert.match(view, /PagesWorkspaceStatusCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
