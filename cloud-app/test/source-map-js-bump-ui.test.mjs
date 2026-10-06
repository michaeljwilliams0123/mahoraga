import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("source-map-js bump on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1005 as observational provenance only", () => {
    const card = readFileSync(join(root, "components/cockpit/SourceMapJsBumpCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /source-map-js 1\.2\.2/);
    assert.match(card, /1\.2\.1 to 1\.2\.2/);
    assert.match(card, /cloud-app/);
    assert.match(card, /Merged #1005/);
    assert.match(card, /CVE-2026-93749/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.doesNotMatch(card, /unsafe-eval/i);
    assert.match(view, /SourceMapJsBumpCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
