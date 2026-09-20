import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
const surface = readFileSync(join(root, "lib/cognitive-learning-surface.ts"), "utf8");

describe("7.0.0-alpha.2 verified-outcome learning surface", () => {
  it("projects promoted verified-outcome with public evidence and calibrated confidence only", () => {
    assert.match(surface, /kind !== "cognitive-learning-promotion"/);
    assert.match(surface, /provenance === "verified-outcome"/);
    assert.match(surface, /calibrated confidence/i);
    assert.match(surface, /evidenceRefs/);
    assert.match(surface, /Private episodic memory, prompts\/transcripts, credentials, and authority grants are not shown or copied/);
  });

  it("maps fail-closed refusal reasons", () => {
    assert.match(surface, /verification-required/);
    assert.match(surface, /Unverified outcome/);
    assert.match(surface, /cycle-not-promotable/);
    assert.match(surface, /Hold \/ non-admitted/);
    assert.match(surface, /cognitive-learning-verification-mismatch/);
    assert.match(surface, /Verification mismatch/);
    assert.match(surface, /unresolved-dissent/);
    assert.match(surface, /prediction-hold/);
    assert.match(surface, /metacognition-hold/);
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
