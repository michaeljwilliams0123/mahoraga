import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/NativeWorldTransitionCard.tsx"), "utf8");

test("7.0.0-alpha.2 cockpit surfaces offline native world-transition bounds", () => {
  assert.match(cockpit, /import \{ NativeWorldTransitionCard \} from "\.\/NativeWorldTransitionCard"/);
  assert.match(cockpit, /<NativeWorldTransitionCard \/>/);
  assert.match(card, /data-testid="native-world-transition"/);
  assert.match(card, /Offline candidate only/);
  assert.match(card, /productionActivated is false/);
  assert.match(card, /executionAuthorityGranted is false/);
  assert.match(card, /creditCost is 0/);
  assert.match(card, /does not grant traffic authority/);
  assert.match(card, /Product remains Mahoraga/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.doesNotMatch(card, /<h2>7\.0\.0-alpha\.2/);
  assert.doesNotMatch(card, /sentience|general intelligence|production cutover/i);
});
