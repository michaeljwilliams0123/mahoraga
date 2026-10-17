import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("7.0.0-alpha.2 cockpit surfaces sovereign candidate path isolation as observational", () => {
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  const card = readFileSync(join(root, "components/cockpit/SovereignCandidatePathIsolationCard.tsx"), "utf8");
  assert.match(cockpit, /SovereignCandidatePathIsolationCard/);
  assert.match(card, /Adversarial regression · observational/);
  assert.match(card, /#1156/);
  assert.match(card, /#1145/);
  assert.match(card, /not production traffic authority/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  assert.match(cockpit, /productName/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /Product remains Mahoraga/);
});
