import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("7.0.0-alpha.2 cockpit surfaces sovereign candidate receipt as observational", () => {
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  const card = readFileSync(join(root, "components/cockpit/SovereignCandidateReceiptCard.tsx"), "utf8");
  assert.match(cockpit, /SovereignCandidateReceiptCard/);
  assert.match(card, /Zero-credit · observational/);
  assert.match(card, /#1136/);
  assert.match(card, /#1155/);
  assert.match(card, /sourceIssueNumber/);
  assert.match(card, /creditCost=0/);
  assert.match(card, /not execution readiness/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  assert.match(cockpit, /productName/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /Product remains Mahoraga/);
});
