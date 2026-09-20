import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectCognitiveLearningSurface, assertNoPrivateLearningLeak } from "../lib/cognitive-learning-surface.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");

describe("7.0.0-alpha.2 verified-outcome learning surface", () => {
  it("projects promoted verified-outcome with public evidence and calibrated confidence only", () => {
    const view = projectCognitiveLearningSurface({
      kind: "cognitive-learning-promotion",
      promotable: true,
      reason: "verified-admitted-outcome",
      record: { provenance: "verified-outcome", confidence: 0.9, evidenceRefs: ["ev:a", "verify:receipt"] },
    });
    assert.equal(view.status, "promoted");
    assert.match(view.headline, /Verified-outcome promoted/);
    assert.equal(view.provenance, "verified-outcome");
    assert.equal(view.confidence, 0.9);
    assert.deepEqual(view.evidenceRefs, ["ev:a", "verify:receipt"]);
    assert.match(view.privacyNote, /not shown or copied/);
    assert.equal(assertNoPrivateLearningLeak(JSON.stringify(view)), true);
  });

  it("maps fail-closed refusal reasons", () => {
    assert.match(projectCognitiveLearningSurface({ kind: "cognitive-learning-promotion", promotable: false, reason: "verification-required", record: null }).reasonLabel, /Unverified outcome/);
    assert.match(projectCognitiveLearningSurface({ kind: "cognitive-learning-promotion", promotable: false, reason: "cycle-not-promotable", record: null }).reasonLabel, /Hold \/ non-admitted/);
    assert.match(projectCognitiveLearningSurface({ kind: "cognitive-learning-promotion", promotable: false, reason: "cognitive-learning-verification-mismatch", record: null }).reasonLabel, /Verification mismatch/);
    assert.match(projectCognitiveLearningSurface({ kind: "cognitive-learning-promotion", promotable: false, reason: "unresolved-dissent", record: null }).reasonLabel, /Unresolved dissent/);
  });

  it("renders the surface on existing CommandCockpit and CockpitView without a new SPA", () => {
    assert.match(cockpit, /INSTITUTIONAL LEARNING/);
    assert.match(cockpit, /verified-outcome/);
    assert.match(cockpit, /Private episodic memory/);
    assert.match(cockpitView, /Institutional learning/);
    assert.match(cockpitView, /projectCognitiveLearningSurface/);
    assert.match(types, /cognitiveLearning/);
    assert.doesNotMatch(cockpit, /privateEpisodicRefs/);
    assert.doesNotMatch(cockpitView, /ownerAuthority/);
  });
});
