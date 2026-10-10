import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cards = readFileSync(join(root, "components/cockpit/CognitiveProvenanceAdmissionCard.tsx"), "utf8");

describe("7.0.0-alpha.2 cognitive provenance admission cockpit UI", () => {
  it("pins product identity Mahoraga and provenance-only build", () => {
    assert.match(cockpitView, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpitView, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpitView, /<h2>7\.0\.0-alpha\.2/);
    assert.match(commandCockpit, /Build provenance is 7\.0\.0-alpha\.2/);
  });

  it("surfaces observational cognitive provenance admission status", () => {
    assert.match(cards, /Cognitive provenance admission/);
    assert.match(cards, /Fixtures supply valid expectedSourceCommit/);
    assert.match(cards, /40-hex SHA, state 'current'/);
    assert.match(cards, /Observational only/);
    assert.match(cards, /Production remains fail-closed/);
    assert.match(cards, /Does not grant traffic authority/);
    assert.match(cards, /does not change production admission logic/);
    assert.match(cockpitView, /<CognitiveProvenanceAdmissionCard \/>/);
    assert.match(commandCockpit, /<CognitiveProvenanceAdmissionCard \/>/);
  });

  it("keeps execution readiness, cognition readiness, and traffic authority separate", () => {
    assert.match(cockpitView, /Execution readiness/);
    assert.match(cockpitView, /Cloudflare cognition/);
    assert.match(cockpitView, /Traffic authority/);
    assert.match(cards, /Execution readiness, cognition readiness, and traffic authority remain separate/);
  });
});
