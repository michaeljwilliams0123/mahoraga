import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("7.0.0-alpha.2 cockpit surfaces sovereign scheduler queue as observational", () => {
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  const card = readFileSync(join(root, "components/cockpit/SovereignSchedulerQueueCard.tsx"), "utf8");
  assert.match(cockpit, /SovereignSchedulerQueueCard/);
  assert.match(cockpit, /queue: max/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  assert.match(cockpit, /productName/);
  assert.match(card, /queue: max/);
  assert.match(card, /cancel-in-progress: false/);
  assert.match(card, /not execution readiness, cognition readiness, or traffic authority/);
  assert.match(card, /Merge #977/);
  assert.match(card, /Product remains Mahoraga/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
});
