import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/AnswerIntegrityCard.tsx"), "utf8");

describe("7.0.0-alpha.2 answer integrity cockpit", () => {
  it("surfaces fail-closed answer integrity without granting traffic authority", () => {
    assert.match(cockpit, /AnswerIntegrityCard/);
    assert.match(cockpit, /Answer integrity/);
    assert.match(card, /Fail closed · observational/);
    assert.match(card, /Merge #985 \(09c30556\)/);
    assert.match(card, /fictional-entity/);
    assert.match(card, /medical-risk arithmetic/);
    assert.match(card, /cognition-provider-response-incomplete/);
    assert.match(card, /3,500 characters per file, 7,000 total/);
    assert.match(card, /not execution, test, commit, or deployment/);
    assert.match(card, /not execution readiness, cognition readiness, or traffic authority/);
    assert.match(card, /zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
