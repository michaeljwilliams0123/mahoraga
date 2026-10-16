import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("7.0.0-alpha.2 cockpit surfaces sovereign public hosted zero-credit routing as observational", () => {
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  const card = readFileSync(join(root, "components/cockpit/SovereignPublicHostedZeroCreditCard.tsx"), "utf8");
  assert.match(cockpit, /SovereignPublicHostedZeroCreditCard/);
  assert.match(card, /Merged #1134/);
  assert.match(card, /Public hosted · zero-cost/);
  assert.match(card, /not execution readiness, not cognition proof, and not production traffic authority/);
  assert.match(card, /Product remains Mahoraga/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
});
