import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("GitLab snapshot depth on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1085 as observational checkout completeness only", () => {
    const card = readFileSync(join(root, "components/cockpit/GitlabSnapshotDepthCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /GIT_DEPTH=0 full ancestry/);
    assert.match(card, /Merged #1085/);
    assert.match(card, /\.gitlab-ci\.yml/);
    assert.match(card, /ancestor 397 commits behind/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
    assert.match(view, /GitlabSnapshotDepthCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
