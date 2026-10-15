import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/SourceFileInspectCard.tsx"), "utf8");

test("surfaces allowlisted GitHub source-file inspect as observational only", () => {
  assert.match(cockpit, /import \{ SourceFileInspectCard \} from "\.\/SourceFileInspectCard"/);
  assert.match(cockpit, /<SourceFileInspectCard \/>/);
  assert.match(card, /GitHub source-file inspect/);
  assert.match(card, /Allowlisted exact-SHA \(observational\)/);
  assert.match(card, /#1102/);
  assert.match(card, /src\/repository-chat-intent\.mjs/);
  assert.match(card, /exact immutable commit SHA/);
  assert.match(card, /not execution readiness, cognition proof, or production traffic authority/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
});
