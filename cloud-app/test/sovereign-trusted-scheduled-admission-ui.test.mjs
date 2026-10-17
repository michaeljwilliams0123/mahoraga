import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/SovereignTrustedScheduledAdmissionCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

test("surfaces observational SovereignTrustedScheduledAdmissionCard for #1151", () => {
  assert.match(card, /Sovereign trusted scheduled admission/);
  assert.match(card, /Release-evidence · observational/);
  assert.match(card, /Merge #1151/);
  assert.match(card, /Not execution readiness, cognition readiness, or traffic authority/);
  assert.match(card, /Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only/);
  assert.match(cockpit, /import \{ SovereignTrustedScheduledAdmissionCard \} from "\.\/SovereignTrustedScheduledAdmissionCard"/);
  assert.match(cockpit, /<SovereignTrustedScheduledAdmissionCard \/>/);
});
