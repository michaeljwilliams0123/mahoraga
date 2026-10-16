import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("7.0.0-alpha.2 cockpit surfaces sovereign candidate preserve as observational", () => {
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  const card = readFileSync(join(root, "components/cockpit/SovereignCandidatePreserveCard.tsx"), "utf8");
  assert.match(cockpit, /SovereignCandidatePreserveCard/);
  assert.match(card, /Preserve stale/);
  assert.match(card, /candidate-existing-base-drift/);
  assert.match(card, /never mutated/);
  assert.match(card, /No remote-branch deletion/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  assert.match(cockpit, /productName/);
  assert.match(card, /Product remains Mahoraga/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /not execution readiness/);
  assert.doesNotMatch(card, /traffic authority/);
});
