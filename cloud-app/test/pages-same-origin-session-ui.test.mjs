import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("7.0.0-alpha.2 cockpit surfaces same-origin Pages session handoff", () => {
  const card = readFileSync(join(root, "components/cockpit/PagesSameOriginSessionCard.tsx"), "utf8");
  const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  assert.match(card, /Same-origin gateway handoff/);
  assert.match(card, /Merged #998/);
  assert.match(card, /Product remains Mahoraga/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /does not grant traffic authority/);
  assert.match(view, /PagesSameOriginSessionCard/);
  assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
  assert.doesNotMatch(card, /Windows 3\.6\.0 activation/);
});
